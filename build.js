const esbuild = require("esbuild");

async function build() {
  await esbuild.build({
    entryPoints: ["./src/_worker.ts"],
    bundle: true,
    outdir: "dist",
    platform: "node",
    format: "esm",
    sourcemap: true,
    minify: true,
  });
  await esbuild.build({
    entryPoints: ["./src/index.html", "./src/_app.tsx"],
    bundle: true,
    outdir: "dist",
    platform: "browser",
    loader: {".html": "copy"},
    format: "iife",
    sourcemap: true,
    minify: true,
  });
}

build();
