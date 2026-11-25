// Builds the site into dist/ with no dependencies: each page is one HTML file with its CSS (and, on
// the home page, its script) inlined, so a first visit is a single request. GitHub Pages can't set
// response headers, so each page carries its Content Security Policy in a meta tag, allowing exactly
// its own inlined code by hash.

import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import site from "./site.config.mjs";

const OUT = "dist";
const year = new Date().getFullYear();
const c = site.company;

if (!c.legalName || !c.number || !c.registeredIn || !c.registeredOffice) {
  throw new Error("site.config.mjs: the footer needs every company detail.");
}

const escape = (s) =>
  String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

const minifyCss = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};,>])\s*/g, "$1")
    .replace(/:\s+/g, ":")
    .replace(/;}/g, "}")
    .trim();

// Drops comment-only lines and indentation. Brotli does the rest.
const minifyJs = (s) =>
  s
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//"))
    .join("\n");

const sha256 = (s) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;

const src = (f) => readFile(join("src", f), "utf8");
const base = minifyCss(await src("base.css"));
const styles = {
  home: base + minifyCss(await src("home.css")),
  doc: base + minifyCss(await src("doc.css")),
};
const homeScript = minifyJs(await src("wire.js"));

// The Wirehum mark (brand/mark.svg), inline so it needs no request. Its colour follows the text.
const MARK =
  `<svg class="mark-icon" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round">` +
  `<path d="M19 20h26M19 44h26" stroke-width="2.5" opacity=".32"/>` +
  `<path d="M14 25h36M14 39h36" stroke-width="3.5" opacity=".6"/>` +
  `<path d="M10 32h44" stroke-width="6"/></svg>`;

// Values pages can use as {{name}}.
const vars = { name: site.name, email: site.email };

function fill(html, file) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`${file}: unknown value {{${k}}}`);
    return escape(vars[k]);
  });
}

// One line on wide screens; on phones each part gets a line of its own.
function legalLine() {
  return [
    escape(c.legalName),
    `Registered in ${escape(c.registeredIn)}, no. ${escape(c.number)}`,
    `Registered office ${escape(c.registeredOffice)}`,
  ]
    .map((part) => `<span>${part}</span>`)
    .join(`<b aria-hidden="true"> · </b>`);
}

function footer() {
  return `<footer class="foot"><p>${legalLine()}</p></footer>`;
}

function page({ meta, body, path }) {
  const home = meta.layout === "home";
  const css = home ? styles.home : styles.doc;
  const title = meta.title ? `${meta.title} · ${site.name}` : site.name;
  const description = meta.description ?? site.description;
  const url = site.origin + path;
  const indexable = meta.index !== false;
  const csp = [
    "default-src 'none'",
    home ? `script-src ${sha256(homeScript)}` : "",
    `style-src ${sha256(css)}`,
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ]
    .filter(Boolean)
    .join("; ");
  const head = [
    `<meta charset="utf-8">`,
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<meta name="referrer" content="strict-origin-when-cross-origin">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(description)}">`,
    indexable ? `<link rel="canonical" href="${url}">` : `<meta name="robots" content="noindex">`,
    `<meta name="theme-color" content="#0a0a0a">`,
    `<meta name="color-scheme" content="dark">`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escape(site.name)}">`,
    `<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(description)}">`,
    indexable ? `<meta property="og:url" content="${url}">` : "",
    `<style>${css}</style>`,
  ].join("");

  const main = home
    ? `<canvas id="wire" aria-hidden="true"></canvas><main class="hero">${body}</main>${footer()}<script>${homeScript}</script>`
    : `<header class="bar"><a class="mark" href="/" aria-label="${escape(site.name)} home">${MARK}${escape(site.name.toLowerCase())}</a></header><div class="trace" aria-hidden="true"></div><main class="prose">${body}</main>${footer()}`;

  return `<!doctype html><html lang="en-GB"><head>${head}</head><body class="${home ? "home" : "doc"}">${main}</body></html>`;
}

// Pages start with a JSON comment: {"path": "/", "title": "…", "description": "…"}.
async function readPages() {
  const files = (await readdir("src/pages")).filter((f) => f.endsWith(".html"));
  return Promise.all(
    files.map(async (file) => {
      const text = await readFile(join("src/pages", file), "utf8");
      const m = text.match(/^<!--(\{[\s\S]*?\})-->\s*/);
      if (!m) throw new Error(`${file}: missing the JSON comment at the top`);
      const meta = JSON.parse(m[1]);
      const body = fill(text.slice(m[0].length), file).replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
      return { file, meta, path: meta.path, body };
    }),
  );
}

async function write(path, content) {
  const file = join(OUT, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}

await rm(OUT, { recursive: true, force: true });
await cp("static", OUT, { recursive: true });

const pages = await readPages();
for (const p of pages) {
  const out = p.meta.output ?? (p.path === "/" ? "index.html" : join(p.path.slice(1), "index.html"));
  await write(out, page(p));
}

const listed = pages.filter((p) => p.meta.index !== false).sort((a, b) => a.path.localeCompare(b.path));
await write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed
    .map((p) => `  <url><loc>${site.origin}${p.path}</loc></url>`)
    .join("\n")}\n</urlset>\n`,
);
await write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${site.origin}/sitemap.xml\n`);

const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, "Z");
await write(
  ".well-known/security.txt",
  `Contact: mailto:${site.email}\nExpires: ${expires}\nPreferred-Languages: en\nCanonical: ${site.origin}/.well-known/security.txt\n`,
);

for (const p of pages) {
  const out = p.meta.output ?? (p.path === "/" ? "index.html" : join(p.path.slice(1), "index.html"));
  const bytes = Buffer.byteLength(page(p));
  console.log(`${out.padEnd(22)} ${(bytes / 1024).toFixed(1).padStart(5)} KB`);
}
