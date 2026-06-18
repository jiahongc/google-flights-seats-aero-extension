# Publishing to the Chrome Web Store

Step-by-step guide to get **Seats.aero for Google Flights** live. Everything that
can be prepared in the repo already has been; this covers the manual steps that
require your Google account and the dashboard.

## 0. One-time setup

1. **Register as a Chrome Web Store developer.**
   Go to <https://chrome.google.com/webstore/devconsole>, sign in, accept the
   developer agreement, and pay the **one-time $5 USD** registration fee.
2. **Set a contact email** under the developer account settings and verify it.
   This is mandatory before you can publish. It is not shown on the listing.

## 1. Build the upload package

```bash
npm run package
```

This produces `dist/seats-aero-google-flights-<version>-chrome.zip` containing
only the files the extension needs (no tests, docs, or Firefox manifest). The
current version is read from `manifest.json` (**1.8.0**).

Sanity-check the zip before uploading:

```bash
unzip -l dist/seats-aero-google-flights-1.8.0-chrome.zip
```

It should contain `manifest.json`, the four JS content/background scripts plus
`airlines.js` / `metros.js` / `protobuf.js`, `popup.html` / `popup.js`, the two
CSS files, and `icons/`.

## 2. Create the listing

In the developer console, click **Add new item** and upload the zip.

Then fill in each field from [`STORE_LISTING.md`](STORE_LISTING.md):

| Dashboard field | Source |
|---|---|
| Product name | "Product name" |
| Summary | "Summary / short description" |
| Description | "Detailed description" |
| Category | **Travel** |
| Language | English (United States) |
| Store icon | `icons/icon128.png` |
| Screenshots | `store/assets/screenshots/*.png` (1280×800) |

Promo tiles (440×280 marquee and 1400×560) are **optional** — skip them for a
first release or add them later (see "Optional promo images" below).

## 3. Privacy practices tab

This tab is the most common reason a review is delayed. Fill it from the
"Single purpose", "Permission justifications", and "Data usage disclosures"
sections of [`STORE_LISTING.md`](STORE_LISTING.md).

- **Single purpose** — paste the provided statement.
- **Permission justifications** — one short paragraph per permission (provided).
- **Data usage** — check **nothing**; this extension collects no user data.
  Then tick the three certification checkboxes.
- **Privacy policy URL** — required. Use:
  ```
  https://github.com/jiahongc/google-flights-seats-aero-extension/blob/master/PRIVACY.md
  ```
  (Push this repo first so the URL resolves. A raw GitHub URL is an acceptable
  privacy policy host. For a nicer URL, enable GitHub Pages — see below.)

## 4. Distribution

- **Visibility:** Public (or Unlisted if you want to share by link only first).
- **Regions:** All regions, unless you want to limit.
- Pricing: Free.

## 5. Submit for review

Click **Submit for review**. First reviews typically take a few business days.
You'll get an email on approval or with the specific policy item to fix.

---

## Optional: nicer privacy-policy URL via GitHub Pages

1. Repo → **Settings → Pages**.
2. Source: **Deploy from a branch**, branch `master`, folder `/ (root)`.
3. After it builds, your policy is at
   `https://jiahongc.github.io/google-flights-seats-aero-extension/PRIVACY`
   (Pages renders Markdown). Use that as the privacy policy URL if you prefer.

## Optional: promo images

Promo tiles must be raster PNGs at exact sizes (440×280, 1400×560). No
vector→PNG converter is installed in this repo, so generate them in a design
tool (Figma, Canva, etc.) using `icons/icon128.png` and the product blue
`#1a73e8` as a starting point. They are not required to publish.

## Optional: automated release zips (already wired)

Pushing a git tag like `v1.8.0` triggers `.github/workflows/release.yml`, which
builds the Chrome and Firefox zips and attaches them to a GitHub Release:

```bash
git tag v1.8.0
git push origin v1.8.0
```

You then download the Chrome zip from the Release and upload it in step 1/2.

## Optional: fully automated store upload

To push new versions straight to the Web Store from CI, add the
[`chrome-webstore-upload-cli`](https://github.com/fregante/chrome-webstore-upload-cli)
step below to a `workflow_dispatch` workflow and store these repo secrets:
`CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`
(obtained via the Google Cloud OAuth flow documented in that tool's README).

```yaml
- run: npx chrome-webstore-upload-cli@3 upload --source dist/*-chrome.zip --auto-publish
  env:
    EXTENSION_ID: ${{ secrets.CWS_EXTENSION_ID }}
    CLIENT_ID: ${{ secrets.CWS_CLIENT_ID }}
    CLIENT_SECRET: ${{ secrets.CWS_CLIENT_SECRET }}
    REFRESH_TOKEN: ${{ secrets.CWS_REFRESH_TOKEN }}
```

This is optional — manual upload is perfectly fine for an occasional release.

---

## Compliance notes (read once)

- **Independent project.** The listing copy states the extension is not
  affiliated with seats.aero or Google, which avoids "impersonation / trademark"
  review flags. Keep that line.
- **Price fetching.** The extension fetches Google Flights result pages client-
  side to read cash prices for the route you're viewing. This is the user's own
  query and no login/paywall is bypassed, but if a reviewer asks, the
  justification is in the permission notes.
- **Minimal permissions.** Only `activeTab`, `storage`, and three scoped host
  permissions are requested. Don't add broad `<all_urls>` host access — it would
  trigger deeper review for no benefit.
- **Single version source.** Bump `manifest.json` (and `manifest.firefox.json`)
  together; CI fails if they differ. The store rejects re-uploads that don't
  increase the version number.
