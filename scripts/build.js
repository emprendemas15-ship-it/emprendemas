import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "dist");
const appFiles = [
  "index.html",
  "manifest.json",
  "styles.css",
  "sw.js",
  "assets",
  "src"
];

for (const item of appFiles) {
  if (!existsSync(path.join(projectRoot, item))) {
    throw new Error(`Falta un archivo necesario para publicar: ${item}`);
  }
}

if (outputDirectory === projectRoot || !outputDirectory.startsWith(`${projectRoot}${path.sep}`)) {
  throw new Error("La ruta de publicación no es segura.");
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
for (const item of appFiles) {
  cpSync(path.join(projectRoot, item), path.join(outputDirectory, item), { recursive: true });
}

console.log(`Aplicación preparada en ${path.relative(projectRoot, outputDirectory)}.`);
