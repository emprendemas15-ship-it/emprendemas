import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const pwaStaticFiles = {
  name: "emprende-plus-pwa-static-files",
  apply: "build",
  generateBundle(_options, bundle) {
    const appAssets = Object.keys(bundle)
      .filter((file) => file.startsWith("assets/"))
      .map((file) => `./${file}`);
    for (const file of ["sw.js", "manifest.json", "assets/icon.svg"]) {
      let source = readFileSync(path.join(projectRoot, file));
      if (file === "sw.js") {
        source = source.toString().replace("const APP_ASSETS = [];", `const APP_ASSETS = ${JSON.stringify(appAssets)};`);
      }
      this.emitFile({
        type: "asset",
        fileName: file,
        source
      });
    }
  }
};

export default defineConfig({
  base: "./",
  plugins: [pwaStaticFiles],
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
