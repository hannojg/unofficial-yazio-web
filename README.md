# Nutrition Desk

A private desktop companion for your YAZIO account, with Apple sign-in through YAZIO’s own website.

Live app: https://nutrition-desk-hanno.equalcandy26.chatgpt.site

## Connect your account

1. Download `public/nutrition-desk-helper.zip` from the app’s connection screen and unzip it.
2. In Chrome or Edge, open `chrome://extensions` / `edge://extensions`, enable Developer mode, and choose **Load unpacked**. Select the unzipped folder.
3. Open the live app in that browser and reload it. The app is private and requires your ChatGPT sign-in.
4. Click **Connect YAZIO**. Complete Apple sign-in on the YAZIO tab it opens. Keep the desk tab open. If the YAZIO tab is already signed in, log out on that page and sign in again to issue a fresh session.
5. Your diary loads automatically. The helper can remain installed for reconnecting later.

The Chrome/Edge helper is necessary because YAZIO’s Apple OAuth callback is registered on YAZIO’s own domain. It observes the successful token response from the official website only during a pairing you start. It sends it to the originating private desk tab. No Apple password is read. Tokens are encrypted with AES-GCM in an HttpOnly cookie bound to your Site identity; the helper does not persist tokens. Pairing expires after 10 minutes. Disconnect removes the browser’s desk session; it does not revoke YAZIO’s token server-side.

## Features

- Browse diary dates and daily energy / macro totals.
- See products, recipes, and quick entries grouped by meal.
- Search the YAZIO database using your account’s food database country and sex.
- Add a product by base quantity; review energy and macros before logging.
- Remove entries with an explicit confirmation.
- Log water in 250 ml increments.
- Renew expired sessions through the official web token endpoint.

Recipe row energy is shown as an em dash; the daily and meal totals still come from YAZIO’s summary. Nutrition goals and profile editing are outside this first version.

## Local development

Requires Node 22.13 or newer.

```sh
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Set `NUTRITION_SESSION_KEY` to a strong random secret in an ignored `.dev.vars` file. The preview provides its own local ChatGPT identity. The included helper allows the hosted app plus localhost / 127.0.0.1 on port 5173. A changed deployment origin must be explicitly updated in `browser-helper/manifest.json` and `browser-helper/background.js`, then repackaged.

```sh
npx tsc --noEmit
node --test tests/integration.mjs
node /absolute/path/to/sites/scripts/build-site.mjs
```

The integration tests require the local preview on port 5173. They use synthetic tokens and never modify a YAZIO account. Tests cover authentication, origin checks, pairing protection, and extension capture boundaries. Live food search and product details were verified against YAZIO; account-specific diary reads, writes, and refresh need a real connected session to verify.

## API research

See `RESEARCH.txt` for APK evidence, endpoint mapping, and verification limits. This tool uses an unofficial private API that YAZIO may change. It is independent of YAZIO.
