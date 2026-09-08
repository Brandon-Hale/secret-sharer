const KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * The key lives in the fragment, which browsers never send in a request. That
 * is the whole trick: the same URL that identifies the secret to the server
 * also carries the key the server must never have.
 */
export function buildSecretUrl(origin: string, id: string, key: string): string {
  return `${origin.replace(/\/$/, "")}/s/${id}#${key}`;
}

/** Returns null when the fragment is missing or is not a plausible key. */
export function keyFromHash(hash: string): string | null {
  const key = hash.startsWith("#") ? hash.slice(1) : hash;
  return key.length > 0 && KEY_PATTERN.test(key) ? key : null;
}
