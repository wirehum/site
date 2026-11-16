# wirehum.com

The Wirehum company website. A dark page with light running along wires, and the pages a company and its apps need: support, privacy policy and terms.

It's built for speed. Each page is one HTML file with its CSS inlined, and the home page's animation is an inline script of about 3 KB gzipped. The home page is about 4.5 KB over the wire, in a single request, with no web fonts, images or third-party scripts. The text is plain HTML, so it shows before the script runs.

## Layout

- `site.config.mjs` holds the company details: name, email addresses, and the registered company details UK law requires on the site. **Fill in `company.number` and `company.registeredOffice` once the company is incorporated.** Until then the footer shows only "© Wirehum", so the site never claims to be a Ltd early.
- `src/pages/` has one HTML fragment per page, starting with a JSON comment (path, title, description). `{{name}}` style values come from the config.
- `src/wire.js` is the home page animation, a 2D canvas:
  - The wires are drawn once to an offscreen canvas, and each frame only draws the pulses.
  - It honours `prefers-reduced-motion` by drawing a single still frame.
  - It pauses with the tab, and caps the pixel ratio at 2.
  - Moving a mouse sends pulses down the nearest wire, and clicking or tapping fires a burst. The name glows as pulses pass behind it.
- `src/*.css` is inlined into each page. `static/` is copied as is.
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
3. **Connect the repo.** In Cloudflare, go to *Workers & Pages*, then *Create*, then *Import a repository*. Install the Cloudflare GitHub app on the `wirehum` organisation (this repo only is enough), and pick `wirehum/website`. Use these settings:
   - **Project name:** `wirehum-site`. It must match `name` in `wrangler.jsonc`.
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`

   The first deploy attaches `wirehum.com` and `www.wirehum.com` to the Worker (from `routes` in `wrangler.jsonc`), and creates their DNS records and certificates. If it fails with "zone not found", the zone isn't Active yet: retry once it is.
4. **Redirect www to the bare domain.** Go to *Rules*, then *Redirect Rules*, then *Create from template*, and choose *Redirect from WWW to root* (301).
5. **Email.** Go to *Email*, then *Email Routing*, and enable it. Cloudflare adds the `MX` and SPF records itself. Add `support@`, `privacy@` and `security@`, and forward them to your own inbox. You'll need to verify that inbox once. Email Routing only receives mail. To reply from these addresses later, move to a mailbox provider such as Fastmail or iCloud+ custom domains. That replaces the routing `MX` records, and needs the provider's DKIM and DMARC records too.
6. **Check:** `https://wirehum.com` loads, `http://` and `www.` both end up there, and a test email to `support@wirehum.com` arrives.

## Before the apps launch

- **Fill in the registered company details** in `site.config.mjs` after incorporation, plus `icoNumber` after paying the ICO fee. Then bump `legalUpdated`.
- **Keep the privacy policy accurate.** It describes Veer as it works today:
  - Routes are planned by brouter.de, places are searched with photon.komoot.io, and map tiles come from OpenFreeMap.
  - Planned and uploaded routes are kept in R2 for one day.
  - The server uses each request's IP address for rate limiting only.
  - There's no crash reporting.

  Update the policy when any of that changes. For example: moving routing or search onto your own servers, adding Sentry or Crashlytics, or moving the API to `api.wirehum.com`.
- **Have someone check the privacy policy and terms.** They're written in plain English to match how Veer works, but they aren't legal advice.
