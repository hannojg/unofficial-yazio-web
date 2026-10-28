# Chrome Web Store preparation

Reviewed against Google's official documentation on October 28, 2026. Version 2.3.0 is a local submission candidate; it has not been submitted to or approved by Google.

## Ready

- Manifest V3 extension with a bundled full-page interface and service worker.
- Packaged JavaScript, fonts, images, and icons; API responses supply data, not executable code.
- A single purpose: manage a user's YAZIO food diary from a desktop browser.
- Access limited to YAZIO's website/API, extension storage, and a scoped request-header rule.
- Existing automated tests and browser verification cover connection, diary reads, portions, calorie calculations, and request payloads. Actual account writes have only been tested with synthetic requests; a disposable test account is still needed for live write verification.
- [Privacy policy describing the current implementation](PRIVACY.md).

## Before submission

1. **Review token storage.** Tokens currently persist in `chrome.storage.local` without extension-added encryption. Google's [user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) describes encryption requirements for stored user data. Resolve this storage design before claiming compliance. Do not add superficial encryption with a key stored beside the ciphertext. Chrome documents [session storage](https://developer.chrome.com/docs/extensions/reference/api/storage) as an in-memory alternative; changing to it would require reconnection after restarting the browser.
2. **Resolve asset rights.** The Yettie mascot and YAZIO Sans font are copied from YAZIO's website. No redistribution license is recorded. Obtain permission or replace them with original/appropriately licensed assets. Include the applicable font license for Rubik. The independent book icon is the project's own asset. Google's [impersonation and intellectual property policy](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property) applies to both the listing and product. The unofficial name and disclaimer do not establish rights to the other assets or API.
3. **Prepare public images.** Use synthetic nutrition data and a sample name, never the maintainer's live diary screenshots in ignored `outputs/`. Google requires a 128×128 PNG icon and at least one screenshot. Review icon padding and current [image requirements](https://developer.chrome.com/docs/webstore/images) before upload.
4. **Finish disclosures and testing.** Review the privacy policy, expose its link in the app, and clearly explain token access and nutrition-data use before Connect. In the developer dashboard, disclose authentication, identifying, health, and relevant website data accurately even though the maintainer receives none of it. Supply reviewer sign-in instructions and a disposable YAZIO test account if required. Do not share a personal account's tokens or credentials.
5. **Use a publisher account.** [Register](https://developer.chrome.com/docs/webstore/register) if needed, pay Google's one-time registration fee, and enable [2-Step Verification](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification). Account terms and payment must be handled by the publisher.
6. **Upload and review.** Build the extension and ZIP the contents of `dist/`, with `manifest.json` at the archive root. Complete listing, privacy, distribution, and test instructions, then [submit for review](https://developer.chrome.com/docs/webstore/publish). Approval is Google's decision; deferred publishing allows a final release decision after review.

## Draft listing

**Name:** (unofficial) yazio web

**Short description:** An unofficial desktop companion for your YAZIO food diary, recent foods, portions, daily goals, and water tracking.

**Description:**

Manage your YAZIO food diary in a full-size browser tab. Browse days and meals, search foods, reuse recent foods, choose quantities and portions, and log water. See your daily calories and macro goals, with light and dark themes.

Connect using YAZIO's own website and your usual sign-in method. Account data is exchanged directly with YAZIO; there is no companion server, advertising, or analytics. Your YAZIO account is required. This is an independent project and is not affiliated with, endorsed by, or produced by YAZIO GmbH. YAZIO's private API may change and interrupt functionality.

**Homepage/support:** https://github.com/hannojg/unofficial-yazio-web

**Privacy URL:** https://github.com/hannojg/unofficial-yazio-web/blob/main/PRIVACY.md

## Permission justifications

| Permission or host | Purpose |
| --- | --- |
| `storage` | Retain the local YAZIO session and temporary connection state. Update this explanation if the storage design changes. |
| `https://www.yazio.com/*` | Connect only the account tab opened after the user clicks Connect, read its loaded YAZIO session, and renew the session through YAZIO's web endpoint. |
| `https://yzapi.yazio.com/*` | Read account/diary/food data and send the user's requested food and water changes. |
| `declarativeNetRequestWithHostAccess` | Set the Android client User-Agent required by the inspected YAZIO API. The rule matches only this extension's own requests to `https://yzapi.yazio.com/v22/`; it does not alter other tabs' or extensions' requests. |

The extension does not download or evaluate remote JavaScript. Reviewers should be told that the packaged account-page bridge reads YAZIO's existing Nuxt/Pinia auth store and that the custom client header is used for the private API. These behaviors must be described transparently in the submission.
