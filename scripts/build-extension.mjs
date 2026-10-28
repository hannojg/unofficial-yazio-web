import { build as viteBuild } from "vite";
import { build as esbuild } from "esbuild";
import { cp, readFile, writeFile } from "node:fs/promises";

await viteBuild();
await esbuild({
  entryPoints: ["extension/background.ts"],
  outfile: "dist/background.js",
  bundle: true,
  format: "esm",
  target: "chrome120",
  minify: true,
});
for (const name of ["read-session", "connect"]) {
  await esbuild({
    entryPoints: [`extension/${name}.ts`],
    outfile: `dist/${name}.js`,
    bundle: true,
    format: "iife",
    target: "chrome120",
    minify: true,
  });
}
const manifestText = await readFile("extension/manifest.json", "utf8");
const manifest = JSON.parse(manifestText);
const packageText = await readFile("package.json", "utf8");
const project = JSON.parse(packageText);
if (manifest.version !== project.version)
  throw new Error("Package and extension versions must match.");
await writeFile("dist/manifest.json", manifestText);
await cp("extension/icons", "dist/icons", { recursive: true });
console.log(
  "Load the dist/ folder in Chrome or Edge → Extensions → Load unpacked.",
);
