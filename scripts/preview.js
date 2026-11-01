import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(projectRoot, "dist");
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".ico", "image/x-icon"]
]);

try {
  if (!statSync(root).isDirectory()) throw new Error();
} catch {
  throw new Error("No existe dist/. Ejecuta npm run build antes de iniciar la vista previa.");
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Método no permitido");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
  } catch {
    response.writeHead(400);
    response.end("Solicitud inválida");
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, filePath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    response.writeHead(403);
    response.end("Acceso denegado");
    return;
  }

  let fileInfo;
  try {
    fileInfo = statSync(filePath);
  } catch {
    response.writeHead(404);
    response.end("No encontrado");
    return;
  }
  if (!fileInfo.isFile()) {
    response.writeHead(404);
    response.end("No encontrado");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
    "Content-Length": fileInfo.size,
    "X-Content-Type-Options": "nosniff"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Vista previa disponible en http://${host}:${port}/`);
});

server.on("error", (error) => {
  console.error(`No se pudo iniciar la vista previa: ${error.message}`);
  process.exitCode = 1;
});
