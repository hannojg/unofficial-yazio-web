import { build as viteBuild } from "vite";
import { build as esbuild } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";

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
const iconSvg = await readFile("app/brand.svg", "utf8");
const iconContents = iconSvg.replace(/^<svg[^>]*>/, "");
const iconBody = iconContents.replace(/<\/svg>\s*$/, "");
const storeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><svg x="16" y="16" width="96" height="96" viewBox="2 2 60 60">${iconBody}</svg></svg>`;
await mkdir("dist/icons", { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const source = size === 128 ? storeIconSvg : iconSvg;
  const renderer = new Resvg(source, {
    fitTo: { mode: "width", value: size },
    font: { loadSystemFonts: false },
  });
  const rendered = renderer.render();
  const png = rendered.asPng();
  await writeFile(`dist/icons/${size}.png`, png);
}
console.log(
  "Load the dist/ folder in Chrome or Edge → Extensions → Load unpacked.",
);
