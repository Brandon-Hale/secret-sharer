"use client";

import { use, useState } from "react";
import { fetchSecret } from "../../../lib/api";
import { decryptSecret } from "../../../lib/crypto";
import { keyFromHash } from "../../../lib/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "revealed"; plaintext: string }
  | { status: "gone" }
  | { status: "error"; message: string };

export default function RevealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [state, setState] = useState<State>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  /**
   * Nothing here runs on mount, and that is the entire point. Slack unfurls,
   * Outlook Safe Links and antivirus proxies fetch URLs automatically — they
   * load the HTML but they do not click. Claiming on mount would mean
   * corporate mail scanning silently burns every secret before its recipient
   * ever sees the page.
   */
  async function onReveal() {
    setState({ status: "loading" });

    // Read the fragment here rather than during render: reading it while
    // rendering produces a hydration mismatch, because the server has no
    // fragment to read.
    const key = keyFromHash(window.location.hash);
    if (key === null) {
      setState({
        status: "error",
        message: "This link is missing its decryption key. Ask the sender for the full link.",
      });
      return;
    }

    try {
      const ciphertext = await fetchSecret(API_URL, id);
      if (ciphertext === null) {
        setState({ status: "gone" });
        return;
      }
      setState({ status: "revealed", plaintext: await decryptSecret(ciphertext, key) });
    } catch (caught) {
      setState({
        status: "error",
        message: caught instanceof Error ? caught.message : "Something went wrong.",
      });
    }
  }

  if (state.status === "revealed") {
    return (
      <main>
        <h1>Here is the secret</h1>
        <p>It has been destroyed on the server. Reloading this page will not bring it back.</p>
        <pre className="reveal">{state.plaintext}</pre>
        <div className="actions">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(state.plaintext).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </main>
    );
  }

  if (state.status === "gone") {
    return (
      <main>
        <h1>This secret is gone</h1>
        <p>
          It was already opened, it expired, or the link was never valid. There is no way to tell
          which, by design.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Someone shared a secret with you</h1>
      <p>It can be opened once. Make sure you are ready to copy it before you continue.</p>
      <button type="button" onClick={() => void onReveal()} disabled={state.status === "loading"}>
        {state.status === "loading" ? "Decrypting…" : "Reveal secret"}
      </button>
      {state.status === "error" && <p role="alert">{state.message}</p>}
    </main>
  );
}
