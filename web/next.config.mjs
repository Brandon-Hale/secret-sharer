/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // @onetime/contracts is consumed as TypeScript source rather than a build
  // artifact, so Next has to compile it alongside the app.
  transpilePackages: ["@onetime/contracts"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The key lives in the fragment, which is never sent in a request —
          // but a referrer would still hand a third party the secret's id.
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        // The reveal route holds plaintext in memory. Nothing about it should
        // ever be stored by a browser or an intermediary.
        source: "/s/:id",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
