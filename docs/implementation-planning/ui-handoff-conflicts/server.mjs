import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname);
const port = Number(process.env.PORT ?? 4177);

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const cleanPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const candidate = resolve(join(root, cleanPath || "index.html"));
  const file = candidate.startsWith(root)
    ? candidate
    : join(root, "index.html");
  const target =
    existsSync(file) && statSync(file).isFile()
      ? file
      : join(root, "index.html");

  response.setHeader(
    "Content-Type",
    types.get(extname(target)) ?? "application/octet-stream",
  );
  createReadStream(target).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`LifeOS UI handoff conflict workshop: http://127.0.0.1:${port}/`);
});
