# ManageMeals browser extension

Browser extension for [managemeals.com](https://managemeals.com). When you click
the toolbar button it opens a popup that:

1. Pre-fills the URL of the page you are currently on.
2. Lets you optionally pick categories and tags.
3. Imports and saves the recipe from that URL.

The import only works on pages the ManageMeals API can parse. If it cannot
retrieve a recipe from the page, the popup shows an error and nothing is saved.

## Structure

```
chrome/    Chrome build (Manifest V3)
firefox/   Firefox build (Manifest V2)
```

Each folder is a complete, self-contained extension. Load/publish the folder,
not the repository root.

The popup files (`popup/mmeals.html`, `popup/mmeals.css`, `popup/mmeals.js`) are
**identical** in both folders — the JavaScript detects the browser at runtime
(`const browser = globalThis.browser || globalThis.chrome`). Only `manifest.json`
differs between the two builds. When you change popup code, apply the same change
to both copies (or `cp` the file across).

## Loading the extension

### Firefox (temporary)

1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `firefox/manifest.json`.

### Chrome (unpacked)

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `chrome/` folder.

## Packaging

Each build is zipped from inside its own folder, so `manifest.json` ends up at
the root of the archive (not nested in a `chrome/` or `firefox/` directory):

```sh
# Chrome
cd chrome && zip -r ../manage-meals-chrome.zip . && cd ..

# Firefox
cd firefox && zip -r ../manage-meals-firefox.zip . && cd ..
```

Bump `"version"` in the relevant `manifest.json` before every release. Both
stores reject an upload whose version is not higher than the published one. The
two versions can drift, but it is simplest to keep them in step.

## Publishing to the Chrome Web Store

1. Register a developer account at
   <https://chrome.google.com/webstore/devconsole>. This is a one-time US$5 fee,
   and the Google account must have 2-Step Verification enabled.
2. Build the Chrome zip (see [Packaging](#packaging)).
3. In the dashboard, click **New item** and upload the zip.
4. Fill in the store listing: name, summary, detailed description, category,
   language, and at least one screenshot (1280x800 or 640x400). The 128x128 icon
   and other sizes come from the manifest.
5. Complete the **Privacy practices** tab: declare the data the extension
   handles and justify each permission it requests (`activeTab`, `cookies`, and
   host access to `https://api.managemeals.com/*`).
6. Set the visibility (public or unlisted) and submit for review. A new listing
   is typically reviewed within a few days; updates are often faster.
7. To release an update, bump the version, re-zip, and upload a new package to
   the same item — the listing, screenshots, and settings are preserved.

## Publishing to Firefox Add-ons (AMO)

Firefox requires signed builds for distribution. The
`browser_specific_settings.gecko.id` in `firefox/manifest.json` gives the add-on
a stable identity for signing.

Manual route:

1. Create a Firefox Account and sign in to
   <https://addons.mozilla.org/developers/>.
2. Click **Submit a New Add-on**, upload the Firefox zip, and choose **On this
   site** (listed in the public directory) or **On your own** (self-distributed,
   unlisted).
3. Complete the listing and submit. AMO signs the add-on automatically when no
   manual review is needed; otherwise it is queued for review.

Command-line route with [`web-ext`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)
(requires Node.js):

```sh
npm install --global web-ext
web-ext lint --source-dir firefox
web-ext sign --source-dir firefox --channel=listed \
  --api-key="$WEB_EXT_API_KEY" --api-secret="$WEB_EXT_API_SECRET"
```

Generate the API key/secret pair at
<https://addons.mozilla.org/developers/addon/api/key/>. Use
`--channel=unlisted` instead to get a signed `.xpi` for self-distribution without
a public listing. Running `web-ext lint` first catches manifest problems before
you upload.

## Permissions used

| Permission | Why |
| --- | --- |
| `activeTab` | Read the URL of the current tab to pre-fill the import field. |
| `cookies` + host access to `https://api.managemeals.com/*` | Store the login/refresh tokens and call the API. |

## Notes

- Auth tokens are stored in cookies scoped to `https://api.managemeals.com/`,
  namespaced per browser (`mmeals_firefox_*` / `mmeals_chrome_*`).
- The access token is short-lived (10 minutes); the popup transparently refreshes
  it with the refresh token when it has expired.
- `manifest.json` for Chrome must stay Manifest V3: Chrome no longer loads
  Manifest V2 extensions. Firefox uses Manifest V2 with `browser_action`.
