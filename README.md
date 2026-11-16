# wirehum.com

The Wirehum company website: a single dark page with light running along wires, the company name, a contact address and the registered company details.

It's built for speed. The page is one HTML file with its CSS inlined, and the animation is an inline script of about 3 KB gzipped. The page is about 4.5 KB over the wire, in a single request, with no web fonts, images or third-party scripts. The text is plain HTML, so it shows before the script runs.

## Layout

- `site.config.mjs` holds the company details: name, contact email, and the registered name, number, place of registration and registered office that UK law requires on a company's website. They appear in the footer.
- `src/pages/` has the home page and the 404 page, each an HTML fragment starting with a JSON comment (path, title, description). `{{name}}` style values come from the config.
- `src/wire.js` is the home page animation, a 2D canvas:
  - The wires are drawn once to an offscreen canvas, and each frame only draws the pulses.
  - It honours `prefers-reduced-motion` by drawing a single still frame.
  - It pauses with the tab, and caps the pixel ratio at 2.
  - Moving a mouse sends pulses down the nearest wire, and clicking or tapping fires a burst. The name glows as pulses pass behind it.
- `src/*.css` is inlined into each page (`home.css` for the home page, `doc.css` for the 404 page). `static/` is copied as is.
- `build.mjs` writes everything to `dist/`, along with `sitemap.xml`, `robots.txt`, `.well-known/security.txt` (its expiry rolls forward on every build) and `_headers`. `_headers` has a Content Security Policy that allows only the inlined script and styles, by hash. Any inline `style="…"` attribute will be blocked, so use classes.

## Commands

```sh
npm install
npm run dev      # build, then serve at http://localhost:8787
npm run build    # build only
```

Deploys happen on every push to `main`, through Cloudflare Workers Builds. Pull requests get their own preview URL.

## Hosting

The site is a Cloudflare Worker with static assets only (`wrangler.jsonc`), so no code runs per request. It's served at `wirehum.com`, and `www.wirehum.com` redirects to it.

### Connecting wirehum.com (one-off)

The domain is registered at Porkbun. Cloudflare runs its DNS, so that the Worker, email routing and redirects all live in one place.

1. **Add the domain to Cloudflare.** In the dashboard, go to *Add a domain*, enter `wirehum.com`, and pick the Free plan. Cloudflare copies the existing DNS records. **Delete Porkbun's defaults** from that list: the three `A` records for `wirehum.com` (parking pages on `207.207.210.x`), the `www` CNAME to `uixie.porkbun.com`, and Porkbun's email forwarding (`MX` to `fwd1`/`fwd2.porkbun.com` and the `TXT` SPF record). Cloudflare will show two nameservers.
2. **Point Porkbun at Cloudflare.** In Porkbun, go to *Domain Management*, open *wirehum.com*, then *Authoritative Nameservers*. Replace the four `*.ns.porkbun.com` entries with Cloudflare's two. DNSSEC isn't on for the domain, so nothing else needs changing. Cloudflare emails you when the zone is *Active*. That's usually within an hour, but can take up to a day.
3. **Connect the repo.** In Cloudflare, go to *Workers & Pages*, then *Create*, then *Import a repository*. Install the Cloudflare GitHub app on the `wirehum` organisation (this repo only is enough), and pick `wirehum/site`. Use these settings:
   - **Project name:** `wirehum-site`. It must match `name` in `wrangler.jsonc`.
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`

   The first deploy attaches `wirehum.com` and `www.wirehum.com` to the Worker (from `routes` in `wrangler.jsonc`), and creates their DNS records and certificates. If it fails with "zone not found", the zone isn't Active yet: retry once it is.
4. **Redirect www to the bare domain.** Go to *Rules*, then *Redirect Rules*, then *Create from template*, and choose *Redirect from WWW to root* (301).
5. **Email.** Go to *Email*, then *Email Routing*, and enable it. Cloudflare adds the `MX` and SPF records itself. Add `hello@` and forward it to your own inbox. You'll need to verify that inbox once. Email Routing only receives mail. To reply from `hello@wirehum.com` later, move to a mailbox provider such as Fastmail or iCloud+ custom domains. That replaces the routing `MX` records, and needs the provider's DKIM and DMARC records too.
6. **Check:** `https://wirehum.com` loads, `http://` and `www.` both end up there, and a test email to `hello@wirehum.com` arrives.
