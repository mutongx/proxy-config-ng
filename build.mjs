import * as esbuild from 'esbuild';

await Promise.all([
    esbuild.build({
        entryPoints: ["./src/_worker.ts"],
        bundle: true,
        outdir: "dist",
        platform: "node",
        format: "esm",
    }),
    esbuild.build({
        entryPoints: ["./src/index.html", "./src/_app.tsx"],
        bundle: true,
        outdir: "dist",
        platform: "browser",
        loader: {".html": "copy"},
        format: "iife",
    })
])
