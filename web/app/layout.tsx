import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "onetime",
  description: "Share a secret through a link that works exactly once.",
  // A reveal link that reached a crawler has already been mishandled, but
  // there is no reason to help it along.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/*
        Nothing third-party belongs in this tree. Any script running on /s/[id]
        can read the fragment and the decrypted plaintext, so analytics and
        error reporting stay out of the layout entirely — if they are ever
        added, they go on the create page alone.
      */}
      <body>{children}</body>
    </html>
  );
}
