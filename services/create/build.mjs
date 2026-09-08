import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  minify: true,
  sourcemap: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // The AWS SDK v3 ships in the Node 22 runtime. Bundling it would add
  // megabytes and freeze a copy that never gets the runtime's patches.
  external: ["@aws-sdk/*"],
  banner: {
    // esbuild's ESM output can still reference require() from transitive CJS
    // dependencies, which has no definition in an ES module.
    js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
  },
});
