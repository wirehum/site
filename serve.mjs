// Serves dist/ at http://localhost:8787 the way GitHub Pages does: /path/ serves /path/index.html,
// /path redirects to /path/ when that's a directory, and anything missing gets 404.html.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = "dist";
const PORT = Number(process.env.PORT) || 8787;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

const isDir = (p) =>
  stat(p).then(
    (s) => s.isDirectory(),
    () => false,
  );

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ""));
  if (await isDir(file)) {
    if (!path.endsWith("/")) {
      res.writeHead(301, { Location: path + "/" }).end();
      return;
    }
    file = join(file, "index.html");
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404, { "Content-Type": TYPES[".html"] }).end(await readFile(join(ROOT, "404.html")));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`http://localhost:${PORT}`));
