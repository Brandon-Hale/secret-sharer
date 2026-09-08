"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { EXPIRY_OPTIONS } from "@onetime/contracts";
import type { ExpiresIn } from "@onetime/contracts";
import { createSecret } from "../lib/api";
import { encryptSecret } from "../lib/crypto";
import { buildSecretUrl } from "../lib/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const EXPIRY_LABELS: Record<ExpiresIn, string> = {
  3600: "1 hour",
  86400: "24 hours",
  604800: "7 days",
};

export default function CreatePage() {
  const [secret, setSecret] = useState("");
  const [expiresIn, setExpiresIn] = useState<ExpiresIn>(86400);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      // Encryption happens here, before anything is sent. The server receives
      // ciphertext and never receives the key.
      const { ciphertext, key } = await encryptSecret(secret);
      const id = await createSecret(API_URL, { ciphertext, expiresIn });

      setLink(buildSecretUrl(window.location.origin, id, key));
      setSecret("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function onCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError("Could not copy automatically. Select the link and copy it manually.");
    }
  }

  if (link !== null) {
    return (
      <main>
        <h1>Your link is ready</h1>
        <p>
          It opens once. Copy it now — the key is part of the link and this page cannot rebuild it.
        </p>
        <code className="reveal">{link}</code>
        <div className="actions">
          <button type="button" onClick={() => void onCopy(link)}>
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setLink(null);
              setCopied(false);
              setError(null);
            }}
          >
            Share another
          </button>
        </div>
        {error !== null && <p role="alert">{error}</p>}
      </main>
    );
  }

  return (
    <main>
      <h1>Share a secret once</h1>
      <p>Encrypted in your browser. We never see the key or the contents.</p>

      <form onSubmit={(event) => void onSubmit(event)}>
        <label>
          Secret
          <textarea
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Paste the secret here"
            rows={6}
            required
          />
        </label>

        <label>
          Expires after
          <select
            value={expiresIn}
            onChange={(event) => setExpiresIn(Number(event.target.value) as ExpiresIn)}
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {EXPIRY_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={busy || secret.length === 0}>
          {busy ? "Encrypting…" : "Create link"}
        </button>
      </form>

      {error !== null && <p role="alert">{error}</p>}
    </main>
  );
}
