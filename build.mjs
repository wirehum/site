// Builds the site into dist/ with no dependencies: each page is one HTML file with its CSS (and, on
// the home page, its script) inlined, so a first visit is a single request. The build also writes
// the headers file, with a Content Security Policy that allows exactly the inlined code by hash.

import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import site from "./site.config.mjs";

const OUT = "dist";
const year = new Date().getFullYear();
const c = site.company;

if (c.number && !c.registeredOffice) {
  throw new Error("site.config.mjs: a company number needs the registered office address too.");
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

// Values pages can use as {{name}}.
const vars = {
  name: site.name,
  tagline: site.tagline,
  "email.support": site.email.support,
  "email.privacy": site.email.privacy,
  "email.security": site.email.security,
  legalUpdated: site.legalUpdated,
  jurisdiction: site.jurisdiction,
  // Until the company exists, "we" is the business trading as Wirehum.
  controller: c.number ? c.legalName : site.name,
};
const raw = {
  identity: c.number
    ? `<p>${escape(c.legalName)} is a company registered in ${escape(c.registeredIn)} (company number ${escape(c.number)}). Its registered office is ${escape(c.registeredOffice)}.</p>`
    : "",
  ico: c.icoNumber
    ? `<p>We are registered with the Information Commissioner's Office under reference ${escape(c.icoNumber)}.</p>`
    : "",
};

function fill(html, file) {
  return html
    .replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => {
      if (!(k in raw)) throw new Error(`${file}: unknown block {{{${k}}}}`);
      return raw[k];
    })
    .replace(/\{\{([\w.]+)\}\}/g, (_, k) => {
      if (!(k in vars)) throw new Error(`${file}: unknown value {{${k}}}`);
      return escape(vars[k]);
    });
}

function legalLine() {
  if (!c.number) return `© ${year} ${escape(site.name)}`;
  return [
    `© ${year} ${escape(c.legalName)}`,
    `Registered in ${escape(c.registeredIn)}`,
    `Company no. ${escape(c.number)}`,
    `Registered office: ${escape(c.registeredOffice)}`,
  ].join(" · ");
}

const NAV = [
  ["/support/", "Support"],
  ["/privacy/", "Privacy"],
  ["/terms/", "Terms"],
];

function nav(path) {
  return NAV.map(([href, label]) =>
    href === path ? `<a href="${href}" aria-current="page">${label}</a>` : `<a href="${href}">${label}</a>`,
  ).join("");
}

function footer(path) {
  return `<footer class="foot"><nav aria-label="Company">${nav(path)}<a href="mailto:${site.email.support}">${site.email.support}</a></nav><p class="legal">${legalLine()}</p></footer>`;
}

function page({ meta, body, path }) {
  const home = meta.layout === "home";
  const css = home ? styles.home : styles.doc;
  const title = meta.title ? `${meta.title} · ${site.name}` : site.name;
  const description = meta.description ?? site.description;
  const url = site.origin + path;
  const indexable = meta.index !== false;
  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(description)}">`,
    indexable ? `<link rel="canonical" href="${url}">` : `<meta name="robots" content="noindex">`,
    `<meta name="theme-color" content="#05070a">`,
    `<meta name="color-scheme" content="dark">`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escape(site.name)}">`,
    `<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(description)}">`,
    indexable ? `<meta property="og:url" content="${url}">` : "",
    `<style>${css}</style>`,
  ].join("");

  const main = home
    ? `<canvas id="wire" aria-hidden="true"></canvas><main class="hero">${body}</main>${footer(path)}<script>${homeScript}</script>`
    : `<header class="bar"><a class="mark" href="/" aria-label="${escape(site.name)} home">${escape(site.name.toLowerCase())}</a><nav aria-label="Site">${nav(path)}</nav></header><div class="trace" aria-hidden="true"></div><main class="prose">${body}</main>${footer(path)}`;

  return `<!doctype html><html lang="en-GB"><head>${head}</head><body class="${home ? "home" : "doc"}">${main}</body></html>`;
}

// Pages start with a JSON comment: {"path": "/privacy/", "title": "…", "description": "…"}.
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
  `Contact: mailto:${site.email.security}\nExpires: ${expires}\nPreferred-Languages: en\nCanonical: ${site.origin}/.well-known/security.txt\n`,
);

const csp = [
  "default-src 'none'",
  `script-src ${sha256(homeScript)}`,
  `style-src ${sha256(styles.home)} ${sha256(styles.doc)}`,
  "img-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

await write(
  "_headers",
  `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin

/favicon.svg
  Cache-Control: public, max-age=604800
`,
);

for (const p of pages) {
  const out = p.meta.output ?? (p.path === "/" ? "index.html" : join(p.path.slice(1), "index.html"));
  const bytes = Buffer.byteLength(page(p));
  console.log(`${out.padEnd(22)} ${(bytes / 1024).toFixed(1).padStart(5)} KB`);
}
