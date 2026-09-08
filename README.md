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

- Node.js 22 or newer
- Terraform 1.10 or newer (for `infra`)

## Commands

```bash
npm install          # once
npm test             # unit tests
npm run typecheck    # project-wide tsc --build
npm run format       # prettier
```

## Status

Under construction. Tasks are tracked as checkboxes in the implementation plan,
and each one lands as its own feature branch.
