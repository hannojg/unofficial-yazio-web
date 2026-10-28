# Privacy: (unofficial) yazio web

Updated October 28, 2026. This describes version 2.4.0.

This extension is an independent companion to YAZIO. It is not affiliated with YAZIO GmbH.

## Information the extension handles

After you choose Connect YAZIO, the extension reads the access and refresh tokens from the signed-in YAZIO account page opened for that connection. It uses those tokens to access your YAZIO account. It does not read your password or your Apple/Google credentials.

The extension requests your account's first name, sex, country, food database country, language, and energy unit. It uses these to display your diary and search the appropriate food database. YAZIO responses also contain nutrition and goal data, including food entries, quantities, nutrients, calorie and macro goals, activity calories, water intake, and recent foods. The extension displays this information and sends the food and water changes you choose back to YAZIO.

## Storage and retention

YAZIO access and refresh tokens are kept in Chrome's in-memory `chrome.storage.session`, with access restricted to trusted extension contexts. The extension does not write them to persistent extension storage or Chrome Sync. The connection survives refreshing the diary and suspension of the background worker. Chrome clears the session when the browser restarts or the extension is reloaded, updated, or disabled; disconnecting or an invalid session also removes the tokens. Token renewal replaces the in-memory tokens.

Startup deletes the persistent token entry saved by older extension versions without importing it. This update therefore requires connecting again once. YAZIO's website maintains its own sign-in independently under YAZIO's policies.

Diary, search, and food details are kept in memory while the dashboard is open. Pending connection details are kept in Chrome's session storage during the connection window. The chosen display theme is stored locally.

Disconnect removes the extension's in-memory session. It does not revoke the YAZIO session or delete information already held by YAZIO. Uninstalling removes the extension's storage; YAZIO retains account data under its own policies.

## Network requests and sharing

The extension sends requests directly to `https://yzapi.yazio.com` for account and diary features and `https://www.yazio.com/api/auth/token` to renew the YAZIO session. Sign-in happens on YAZIO's website and, when you choose it, your sign-in provider. These services receive the information needed for their requested operations and ordinary connection metadata such as your IP address. Their own privacy policies govern their processing.

There is no companion backend, advertising, analytics, or telemetry in the extension. The maintainer does not receive your tokens, diary, or searches through the extension. The extension does not sell data, use it for advertising, or send it to unrelated services. It accesses only the YAZIO domains declared in its manifest and does not collect general browsing history.

## Support

You can report problems through [GitHub issues](https://github.com/hannojg/unofficial-yazio-web/issues). Issues are public: do not include tokens, account details, or personal nutrition screenshots. GitHub processes information submitted there under its own privacy policy.
