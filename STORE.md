# Chrome Web Store preparation

Reviewed against Google's official documentation on October 28, 2026. Version 2.4.1 is a local submission candidate; it has not been submitted to or approved by Google.

## Ready

- Manifest V3 extension with a bundled full-page interface and service worker.
- Packaged JavaScript, fonts, images, and icons; API responses supply data, not executable code.
- A single purpose: manage a user's YAZIO food diary from a desktop browser.
- Access limited to YAZIO's website/API, extension storage, and a scoped request-header rule.
- Existing automated tests and browser verification cover connection, diary reads, portions, calorie calculations, and request payloads. Actual account writes have only been tested with synthetic requests; a disposable test account is still needed for live write verification.
- [Privacy policy describing the current implementation](PRIVACY.md).
- Paytone One headings and Rubik body text with their OFL copyright/license notices bundled. The Yettie mascot and YAZIO Sans font are absent from the current source and package.
- Tokens stay in trusted-context, in-memory session storage. Old persistent token records are deleted without import. Tests cover worker restarts, browser-session reset, legacy cleanup, and rotation without persistent writes.
- Both Connect entry points describe sign-in-session and nutrition-data access before the action, explain when reconnection is needed, and link the privacy policy. The diary footer also links it.
- Store images in local `outputs/chrome-web-store/`: a 128×128 PNG icon with 96×96 artwork and transparent padding, plus two 1280×800 JPEG screenshots of the diary and portion selector. Screenshots use a fictional sample account and synthetic nutrition data. The same padded icon is bundled in the extension.

## Before submission

1. **Review privacy declarations.** The token-storage change and in-app disclosure are implemented; see the review below. Complete the store's data-use declarations to match the current behavior.
2. **Review branding and listing.** The book icon is the project's own asset, and the current fonts are OFL-licensed. Older Git commits retain the prototype's YAZIO assets; those commits are not part of the extension package. Google's [impersonation and intellectual property policy](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property) still applies to the listing and product. The unofficial name and disclaimer do not establish rights to YAZIO's trademark or API.
3. **Upload public images.** Use `outputs/chrome-web-store/store-icon-128.png` and the two `screenshot-*.jpg` files. These follow Google's [image requirements](https://developer.chrome.com/docs/webstore/images). The folder and `outputs/chrome-web-store-assets.zip` are local, ignored artifacts; they contain no live account data.
4. **Finish testing and reviewer access.** Review the privacy policy. In the developer dashboard, disclose authentication, identifying, health, and relevant website data accurately even though the maintainer receives none of it. Supply reviewer sign-in instructions and a disposable YAZIO test account if required. Do not share a personal account's tokens or credentials.
5. **Use a publisher account.** [Register](https://developer.chrome.com/docs/webstore/register) if needed, pay Google's one-time registration fee, and enable [2-Step Verification](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification). Account terms and payment must be handled by the publisher.
6. **Upload and review.** Build the extension and ZIP the contents of `dist/`, with `manifest.json` at the archive root. Complete listing, privacy, distribution, and test instructions, then [submit for review](https://developer.chrome.com/docs/webstore/publish). Approval is Google's decision; deferred publishing allows a final release decision after review.

## Draft listing

**Name:** (unofficial) yazio web

**Short description:** An unofficial desktop companion for your YAZIO food diary, recent foods, portions, daily goals, and water tracking.

**Description:**

Manage your YAZIO food diary in a full-size browser tab. Browse days and meals, search foods, reuse recent foods, choose quantities and portions, and log water. See your daily calories and macro goals, with light and dark themes.

Connect using YAZIO's own website and your usual sign-in method. Account data is exchanged directly with YAZIO; there is no companion server, advertising, or analytics. Sign-in stays in memory; reconnect after restarting Chrome or reloading/updating the extension. Your YAZIO account is required. This is an independent project and is not affiliated with, endorsed by, or produced by YAZIO GmbH. YAZIO's private API may change and interrupt functionality.

**Homepage/support:** https://github.com/hannojg/unofficial-yazio-web

**Privacy URL:** https://github.com/hannojg/unofficial-yazio-web/blob/main/PRIVACY.md

## Permission justifications

| Permission or host | Purpose |
| --- | --- |
| `storage` | Keep YAZIO tokens and temporary connection state in trusted-context `chrome.storage.session`. Startup removes the token entry saved in persistent storage by older versions. |
| `https://www.yazio.com/*` | Connect only the account tab opened after the user clicks Connect, read its loaded YAZIO session, and renew the session through YAZIO's web endpoint. |
| `https://yzapi.yazio.com/*` | Read account/diary/food data and send the user's requested food and water changes. |
| `declarativeNetRequestWithHostAccess` | Set the Android client User-Agent required by the inspected YAZIO API. The rule matches only this extension's own requests to `https://yzapi.yazio.com/v22/`; it does not alter other tabs' or extensions' requests. |

The extension does not download or evaluate remote JavaScript. Reviewers should be told that the packaged account-page bridge reads YAZIO's existing Nuxt/Pinia auth store and that the custom client header is used for the private API. These behaviors must be described transparently in the submission.

## Token-storage review

Google's [main policy, Handling Requirements](https://developer.chrome.com/docs/webstore/program-policies/policies#handling_requirements) requires secure handling of user data, modern cryptography for transmission, and secure authentication information. It does not prescribe a specific Chrome storage API. The [user data FAQ, question 9](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) is more explicit: stored data must use strong encryption such as RSA or AES. Questions 3 and 14 confirm that local-only data handling still requires disclosure and a privacy policy; local storage is not a blanket exception.

Chrome's [storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage#storage_areas) recommends `storage.session` for sensitive data. It is in memory, survives service-worker suspension, and clears on browser restart, extension reload/update, or disabling the extension. It does not provide persistent sign-in across those events.

Current implementation review:

- API and refresh requests use HTTPS. Tokens are not sent to a companion server, analytics, or unrelated destinations.
- Tokens are in `chrome.storage.session`, restricted to `TRUSTED_CONTEXTS`. They survive worker suspension but are cleared when Chrome restarts or the extension reloads, updates, or is disabled. No persistent token store is used.
- Dashboard commands verify the extension origin and frame, and token import verifies the user-started, unexpired YAZIO tab. Tokens are not returned to the dashboard or logged.
- Diary details also stay in memory. Startup deletes the older persistent token entry without importing it, so existing users reconnect once after updating.
- Both Direct Connect buttons now have the same explanation of sign-in-session/profile/diary access, direct YAZIO sync, memory-only sign-in, and reconnection. The disclosure appears before each button and links the privacy policy.

Implemented decision: use `chrome.storage.session` for tokens and require reconnection after browser restarts and extension reloads/updates. There is no persistent-storage alternative or automatic import of old disk tokens. This follows Chrome's guidance for sensitive data; it does not guarantee store approval.
