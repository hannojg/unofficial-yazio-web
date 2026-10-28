# Nutrition Desk

A personal YAZIO companion that runs entirely inside a Chrome or Edge extension. Click its toolbar icon to open your diary in a full-size tab. No web server, hosting account, ChatGPT sign-in, or runtime secrets are needed.

## Install

Requires Node 22.13 or newer and Chrome / Edge 120 or newer.

```sh
npm ci
npm run build
```

1. Remove the old **Nutrition Desk · YAZIO Connect** helper if it is installed.
2. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select this project's **dist** folder, which contains `manifest.json`.
4. Pin **Nutrition Desk** and click its toolbar icon.
5. Click **Connect YAZIO**. If you are already signed in on YAZIO, the existing session connects automatically. Otherwise, use your usual sign-in method in the YAZIO tab it opens.

Keep `dist` in place: Chrome loads the unpacked extension from that folder. After changing the source, run `npm run build`, click **Reload** on the extension card, and reload any open Nutrition Desk tab. Rebuilding does not remove the local session.

## Features

- Browse diary dates, daily energy / macro totals, and meals.
- View synced recent foods with the last-used quantity prefilled.
- Search YAZIO using your account's food database country and sex.
- Review product portions before logging them.
- Remove entries with confirmation and track water in 250 ml increments.
- Renew sessions through YAZIO's official web token endpoint.
- Switch between the YAZIO-style light and dark themes.

Recipe rows show an em dash for energy; meal and daily totals come from YAZIO. Unit preferences remain partly supported: the energy unit label is read from the API, water uses litres/ml, food amounts use each product's base unit, and macros use grams. Complete unit conversion and profile / goal editing are not implemented.

## How it works

The React dashboard and all scripts, fonts, and images are bundled into the extension. Its Manifest V3 service worker calls `yzapi.yazio.com` for diary operations and `www.yazio.com/api/auth/token` for refresh. The extension requests access only to those two hosts, plus `storage` and `declarativeNetRequestWithHostAccess`. One request-header rule identifies this extension’s own `yzapi.yazio.com/v22/` requests as the inspected YAZIO Android client, which the diary API requires. It does not change headers for website tabs or other extensions.

Sign-in happens on YAZIO's official website using your chosen method. After you click Connect, a content script in the specific YAZIO tab opened by the extension reads YAZIO’s already loaded page auth store. This single flow works for both an existing session and a new sign-in. The worker accepts it only from that tab during the ten-minute connection window, and validates it with YAZIO before storing it. Other YAZIO tabs never read or import the session.

Access and refresh tokens stay in `chrome.storage.local`, restricted to trusted extension contexts. They are not synced with Chrome Sync or returned to the dashboard. This is browser-managed local storage, not an encrypted server cookie. Disconnect deletes the local session; it does not revoke the token at YAZIO. The extension never reads your password. There is no analytics service or Nutrition Desk backend.

Pairing state is stored in `chrome.storage.session`, so it survives the worker going idle. Token rotation is persisted locally, and concurrent expired requests share one refresh. Reconnection is required after uninstalling or using a different browser profile.

## Development and checks

```sh
npm run typecheck
npm test
npm run build
```

Test fixtures use synthetic sessions and mocked requests. They cover connection origin/tab restrictions, expiry and cancellation, worker restarts, token rotation and disconnect races, recent-food ordering, and exact food/water payloads. They never modify a real YAZIO account.

Load the built extension to test browser behavior. A normal website tab does not have extension APIs and is not a supported runtime.

The sidebar holds navigation, account status/settings, and the theme switch. The diary has no separate header bar or persistent sync badge. Branding comes from `app/brand.svg`: Vite shares it between the sidebar and favicon, and the build renders the toolbar PNG icons from that same source.

## API research

See `RESEARCH.txt` for APK evidence and endpoint mapping. This tool uses an unofficial private API that YAZIO may change. It is independent of YAZIO. The former hosted version is retained in Git history, not as a second runtime in this project.
