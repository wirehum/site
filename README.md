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
- The logo is the Echo mark: a bold wire with fading afterimages either side. It sits above the name on the home page (its echoes spread a little as the name glows) and beside the wordmark in the 404 page's header, inline in both, so it costs no request. `static/favicon.svg` is a version tuned for tab sizes, and `static/apple-touch-icon.png` is for iPhone home screens.
- `brand/` holds the master logo files and isn't published: `mark.svg` for dark backgrounds, `mark-on-light.svg` for light ones, and `avatar.svg` with `avatar.png` (500 px), the GitHub organisation's avatar.
- `src/*.css` is inlined into each page (`home.css` for the home page, `doc.css` for the 404 page). `static/` is copied as is.
- `build.mjs` writes everything to `dist/`, along with `sitemap.xml`, `robots.txt`, `.well-known/security.txt` (its expiry rolls forward on every build). GitHub Pages can't set response headers, so each page carries a Content Security Policy in a meta tag that allows only its own inlined script and styles, by hash. Any inline `style="…"` attribute will be blocked, so use classes.
- `serve.mjs` serves `dist/` locally the way GitHub Pages does, including the 404 page.
- `.github/workflows/pages.yml` builds and publishes the site.

## Commands

There's nothing to install: the build and the local server use only Node (22 or later).

```sh
npm run dev      # build, then serve at http://localhost:8787
npm run build    # build only
```

Every push to `main` deploys, through GitHub Actions to GitHub Pages.

## Hosting

GitHub Pages serves the site at `wirehum.com`, and `www.wirehum.com` redirects to it. The domain is registered at Porkbun, which also runs its DNS and forwards `hello@wirehum.com`.

GitHub Pages is free for public repos. On the organisation's Free plan, a private repo can't publish to Pages, so this repo is public. Nothing in it is secret: the company details are on the site anyway.

### Connecting wirehum.com (one-off)

1. **Verify the domain for the organisation.** On GitHub, go to the `wirehum` organisation's *Settings*, then *Pages*, then *Add a domain*, and enter `wirehum.com`. GitHub shows a `TXT` record named `_github-pages-challenge-wirehum`. Add it in Porkbun (step 4 explains where), wait a few minutes, then press *Verify*. This stops anyone else's repo from claiming the domain.
2. **Make the repo public:** `gh repo edit wirehum/site --visibility public --accept-visibility-change-consequences`. Alternatively, keep it private and move the organisation to GitHub Team (about $4 a month per member).
3. **Turn on Pages.** In this repo, go to *Settings*, then *Pages*, and under *Build and deployment* set *Source* to **GitHub Actions**. Then open *Actions*, find *Deploy to GitHub Pages*, and press *Run workflow*. Once it's green, the site is live at `https://wirehum.github.io/site/`. Only the tab icon is missing there, because it's linked from the site's root.
4. **Point the domain at GitHub.** In Porkbun, go to *Domain Management*, then *wirehum.com*, then *DNS*.
   - **Delete** Porkbun's parking records: the `ALIAS` or `A` records for the bare domain, and the `CNAME` records for `www` and `*` that point at `*.porkbun.com`. Don't touch the `MX` records or the `TXT` record that starts `v=spf1`: they're the email forwarding.
   - **Add** these records. Leave the host blank for the bare domain.

     | Type | Host | Answer |
     |---|---|---|
     | A | | `185.199.108.153` |
     | A | | `185.199.109.153` |
     | A | | `185.199.110.153` |
     | A | | `185.199.111.153` |
     | AAAA | | `2606:50c0:8000::153` |
     | AAAA | | `2606:50c0:8001::153` |
     | AAAA | | `2606:50c0:8002::153` |
     | AAAA | | `2606:50c0:8003::153` |
     | CNAME | `www` | `wirehum.github.io` |
5. **Set the custom domain.** Back in the repo's *Settings*, then *Pages*, enter `wirehum.com` under *Custom domain* and save. Once the DNS check passes, tick **Enforce HTTPS**. The certificate can take up to an hour to arrive, and the box stays greyed out until it does. GitHub redirects `www.wirehum.com` to `wirehum.com` itself.
6. **Email.** In Porkbun, go to *Email*, then *Email Forwarding* for wirehum.com, and forward `hello` to your own inbox. Porkbun's forwarding only receives mail. To reply from `hello@wirehum.com` later, move to a mailbox provider such as Fastmail or iCloud+ custom domains. That replaces the `MX` records, and needs the provider's DKIM and DMARC records too.
7. **Check:** `https://wirehum.com` loads, `http://` and `www.` both end up there, and a test email to `hello@wirehum.com` arrives.
