# onetime

Share a secret through a link that works exactly once.

The secret is encrypted in the browser with AES-GCM. The key travels in the URL
fragment, which browsers never put on the wire, so the server stores ciphertext
it cannot read. Reading a secret destroys it: the retrieve path is a single
conditional `DeleteItem` that returns the item it deleted, so two people opening
the same link concurrently produce exactly one success.


## Layout

| Path                   | What it is                                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| `packages/contracts`   | Wire types, limits and validators, imported by browser and Lambda alike |
| `packages/lambda-http` | CORS-safe response builders and the single shared 404 body              |
| `services/create`      | `POST /secrets` — write-only Lambda                                     |
| `services/retrieve`    | `GET /secrets/{id}` — claim-by-delete Lambda                            |
| `services/integration` | Tests that need a real DynamoDB API, including the concurrency proof    |
| `infra`                | Terraform: table, roles, functions, REST API, domain                    |
| `web`                  | Next.js app deployed on Vercel                                          |

## Requirements

- Node.js 24 or newer
- Terraform 1.10 or newer, for `infra`

## Commands

```bash
npm install               # once
npm test                  # unit tests
npm run test:integration  # concurrency suite, in-process DynamoDB
npm run typecheck         # node workspaces, then the web app
npm run format            # prettier
npm run dev -w @onetime/web
```

`npm run test:integration` runs against in-process [dynalite] by default, so it
needs neither Docker nor a JVM. Setting `DDB_ENDPOINT` points the same suite at
a real DynamoDB Local, which is what CI does.

[dynalite]: https://github.com/mhart/dynalite

## Deploying

Vercel serves `web` through its git integration and is not managed by
Terraform. Everything else is.

### First time, by hand

Only one thing is outside the Terraform config, and `infra/bootstrap` covers
both account-level pieces:

1. **The state bucket**, via `infra/bootstrap`. It is a separate config with
   local state because the backend cannot store the state of the thing that
   creates it. Locking uses `use_lockfile`, so no DynamoDB lock table is
   needed — most tutorials are out of date on this.

   ```bash
   terraform -chdir=infra/bootstrap init
   terraform -chdir=infra/bootstrap apply     # prints the bucket name
   ```

   The bucket is versioned, encrypted and fully public-access-blocked, and its
   name embeds the account id so it is globally unique without an identifier
   being committed here. Run once, then leave it alone.

2. **The GitHub OIDC provider**, also in `infra/bootstrap`. One provider serves
   every repository in the account, so the main stack must not own it —
   destroying that stack would break unrelated pipelines. The same apply
   creates it and prints its ARN.

The deploy role and its permissions **are** in the main config
(`infra/oidc.tf`), scoped to what this stack manages rather than the
`AdministratorAccess` these pipelines usually get. Every statement is pinned to
the `onetime-*` prefix or a single named resource, and `dynamodb:DeleteTable`
is absent everywhere: `prevent_destroy` stops Terraform, and withholding the
permission stops a compromised pipeline too.

> **Known limit.** `iam:CreateRole` and `iam:AttachRolePolicy` over `onetime-*`
> is still real power — the role could mint a new `onetime-*` role, attach a
> broad policy, and pass it to a Lambda. Closing that properly needs a
> permissions boundary. Worth doing if this stops being a personal project.

### Automated deploys

`ci` runs on every push and PR. `deploy` waits for `ci` to pass on `main`
(via `workflow_run`), assumes an AWS role through OIDC, applies, and then smoke
tests the live API. No AWS access key exists anywhere.

To set it up on a fresh clone or fork:

```bash
gh secret set AWS_DEPLOY_ROLE_ARN --body "$(terraform -chdir=infra output -raw deploy_role_arn)"
gh secret set TF_STATE_BUCKET   --body "onetime-tfstate-<account id>"
gh variable set ALLOWED_ORIGIN     --body "https://<your vercel or custom domain>"
gh variable set BUDGET_ALERT_EMAIL --body "<you@example.com>"
gh variable set OIDC_PROVIDER_ARN  --body "$(terraform -chdir=infra/bootstrap output -raw github_oidc_provider_arn)"
```

Two things that are easy to get wrong here:

- **The subject claim.** GitHub mints _immutable_ subject claims that identify
  the repo by numeric id, not by name — `repo:owner@140154673/repo@1361361822`.
  A trust policy matching only `repo:owner/repo` never matches, and the error
  is a bare "Not authorized to perform sts:AssumeRoleWithWebIdentity". Check
  what your repo actually sends with
  `gh api repos/<owner>/<repo>/actions/oidc/customization/sub`. The ids reach
  Terraform from the `github` context, so nothing numeric is stored.
- **`environment:` changes the claim.** A job declaring an environment gets
  `…:environment:<name>` instead of `…:ref:refs/heads/main`. The deploy job
  declares `production`, so that environment must exist in the repository.

`DOMAIN_NAME` is deliberately unset — GitHub rejects an empty variable value,
and an absent variable resolves to the empty string, which is the Terraform
default anyway.

### Then

```bash
cd infra
terraform init \
  -backend-config="bucket=<state bucket>" \
  -backend-config="key=onetime/terraform.tfstate" \
  -backend-config="region=ap-southeast-2"

npm run build -w @onetime/service-create
npm run build -w @onetime/service-retrieve   # Terraform zips what esbuild leaves

terraform apply -var="allowed_origin=https://<your domain>"
```

`terraform output acm_validation_records` prints the DNS records that validate
the certificate; `api_domain_target` is what `api.<domain>` should point at.
Both are created at your registrar, by hand, because the zone need not be in
Route 53.

### Verifying a deploy with curl

No frontend required:

```bash
API=$(terraform -chdir=infra output -raw api_invoke_url)

ID=$(curl -sX POST "$API/secrets" -H 'content-type: application/json' \
      -d '{"ciphertext":"aGVsbG8","expiresIn":3600}' | jq -r .id)

curl -so /dev/null -w '%{http_code}\n' "$API/secrets/$ID"   # 200, once
curl -so /dev/null -w '%{http_code}\n' "$API/secrets/$ID"   # 404, ever after

curl -sX POST "$API/secrets" -H 'content-type: application/json' \
  -d '{"ciphertext":"aGVsbG8","expiresIn":60}' \
  -o /dev/null -w '%{http_code}\n'                          # 400, expiry not allowed
```

### Vercel

Set the root directory to `web` and `NEXT_PUBLIC_API_URL` per environment.

Preview deployments get random URLs and will fail CORS against production,
because `allowed_origin` is one exact origin and widening it would defeat the
point. Point previews at a separate dev API — a second Terraform workspace with
its own origin and its own table.

## Things that look like oversights and are not

- **Point-in-time recovery is off.** A restorable backup would let anyone with
  restore rights read every secret ever stored, including ones the sender
  believes are long gone.
- **All three 404 causes are identical** — already claimed, expired, never
  existed. Distinguishing them tells a caller whether a link was ever real.
- **The reveal page does not fetch on mount.** Link scanners load HTML but do
  not click buttons; claiming on mount would let corporate mail security
  silently destroy every secret in transit.
- **No analytics or error reporting on `/s/[id]`.** Anything running there can
  read the fragment and the plaintext.
- **`create` cannot read the table and `retrieve` cannot write to it.** Neither
  can Scan, Query or GetItem, so neither can enumerate anything.
