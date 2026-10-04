# Verification record — 4 October 2026

## Current UI update — 1.0.1 / code 2

[APK build 37183515362](https://github.com/mohitchoyal2002/Aone-mart-app/actions/runs/37183515362) succeeded from commit `c65323667419256fbf43b006b2b17eb2f8a85700`. Mobile TypeScript and Expo lint passed. [Native workflow 37184197151](https://github.com/mohitchoyal2002/Aone-mart-app/actions/runs/37184197151) passed **28 checks on API 29 and 28 on API 36**, with 14 open-keyboard field checks per platform.

The checks measure the full focused input and keyboard-toolbar bounds against the visible IME. They cover connection URL, signup Name/Phone/Password and Next controls, search and hidden/restored bottom navigation, cart note, password dialog, inventory numeric/unit fields, account password, coupon numeric field, store instructions/rewards and AI composer/Send button. Customer order/pickup and separate admin/tablet navigation also passed. Modal, chat and closed-keyboard system-navigation screenshots were reviewed. These are emulator checks, not a claim that every physical device was tested.

## Backend inventory update

The backend integration suite now passes **26/26**, with no skipped tests. Backend TypeScript and build passed. Four added integration cases verify POS column mapping, exact decimal prices/leading-zero barcodes, saved source fields, separate stable IDs for zero barcodes, updates after row reordering, preserved admin costs/images/settings/reservations, and complete rejection of invalid stock or duplicate real barcodes. The existing order, coupon, reward, soft deletion, invoice, session and realtime checks continue to pass.

The uploaded inventory contains 45 rows and 1,315 on-hand units across 10 categories. It contains no purchase cost or product images. Actual database import/restart verification is recorded separately in the private inventory import report; commercial data and the SQLite backup are excluded from GitHub.

## Previous release — 1.0.0 completed checks

| Check | Result and scope |
| --- | --- |
| Backend integration suite | **22/22 passed**, no skipped tests; isolated in-memory SQLite database |
| Backend TypeScript | Passed |
| Mobile TypeScript | Passed |
| Native mobile ESLint | Passed, no errors or warnings |
| Backend build | `tsc` compiled all API modules successfully |
| Android APK compilation | GitHub Actions run `37177391580` succeeded; 629 native build tasks executed |
| Delivered APK signing | Private RSA-4096 Aone Mart key; APK v2/v3 signature verified; release is not debuggable |
| APK compatibility | Package `com.aonemart.app`, version 1.0.0/code 1, min API 24, target API 36, arm64 and x86_64 |
| Native page alignment | ZIP 16 KB alignment and all 24 arm64 ELF library load segments checked |
| APK integrity | Artifact hashes, APK signature and bundled-secret scan passed; final SHA-256 `57bc53d84101d65d73c401b316b38b39d76c30eeee2e082d99248b3347a471cb` |
| Native Android customer flow | Hardware-accelerated API 29 emulator: APK installation, startup, server connection, signup, native catalog, cart, order placement, realtime packed state and pickup confirmation passed |
| Native Android admin flow | Separate admin login and tablet dashboard, inventory, customers, sales, coupons, AI and settings navigation passed; screenshots captured |
| Native smoke test | GitHub Actions run `37177953445` passed 14 checks against an isolated backend and sample catalog |
| Primary button rendering | Native minimum touch height check passed; connection/login/inventory screenshot review shows the intended filled buttons |
| Distributed APK payload | Every application entry matches the tested CI APK; private release signing applied afterwards |
| Production startup | Fresh database admin bootstrap, health check, admin login, graceful shutdown and repeated bootstrap passed |
| VPS configuration | Docker Compose YAML checked; persistent data, private API port and deferred notifications configured |
| Android JS export | Expo/Metro generated a **6.3 MB Hermes Android bundle** from `src/app`; assets resolved |
| Android preview prebuild | Generated Android native project from app config and plugins |
| Android production prebuild | Generated native project; manifest cleartext traffic is **false** |
| Custom notification resource | `aone_order.wav` exists in generated `android/app/src/main/res/raw` |
| Dependency compatibility | `expo install --check` reported up to date using the installed SDK 57 compatibility data; offline mode could not check React Native Directory |
| Live Gemini service | Real admin API chat returned HTTP 200 with **12 active sample products and ₹0 selected-period sales**, matching the local database |
| GitHub source transfer | Complete native FE, backend, sample CSVs, deployment configuration and APK workflow pushed to `mohitchoyal2002/Aone-mart-app`; private credentials excluded |
| Source archive | Excludes private environment files, API keys, JWT/admin credentials, SQLite data, node_modules and generated native/build directories |

The JavaScript export and prebuild are compilation preparation, not an APK installation or physical-device UI test.

## Automated integration coverage

1. Customer/admin authorisation and rejected role injection in signup.
2. Product search and hiding purchase costs from customers.
3. Quotes leave inventory unchanged; orders reserve stock once; idempotent retries.
4. Reserved coupon limits and stock-edit reservation protection.
5. Allowed order transitions, customer ownership and rejected invalid transitions.
6. Pickup creates an invoice, deducts stock and credits rewards exactly once.
7. Rejection reason required; rejection refunds points/coupon and releases stock.
8. Targeted coupon visibility and redemption restrictions.
9. Overselling and duplicate cart lines fail atomically.
10. CSV preview is read-only; duplicate imports cannot commit twice.
11. Invalid product CSV or duplicate SKUs block the complete import.
12. Invoice line grouping, historical stock preservation, IST reporting and duplicate numbers.
13. Insufficient invoice stock deduction rolls back the whole transaction.
14. Customer soft deletion retains invoice history and revokes access/refresh credentials.
15. Refresh token rotation rejects old-token replay.
16. Mocked AI context contains reports, excludes secrets and returns safe provider errors.
17. Persistent new-order notifications carry the custom Android sound.
18. Checkout price changes block placement before reserving stock; completed retries remain safe.
19. Customer active/past filters apply before pagination and preserve account isolation.
20. Logout immediately revokes that access/refresh session while other sessions remain valid.
21. Admin-only CSV export/settings; pausing order acceptance blocks checkout.
22. Real authenticated WebSocket delivery carries the custom tone and closes after session revocation.

## Not completed in this environment

| Item | Reason / required next action |
| --- | --- |
| Physical-device QA | Native phone/tablet smoke checks passed on the hardware-accelerated emulator. Actual devices and the mart's real catalog/invoices remain to be checked. |
| Background notification/tone delivery | Expo project ID, Android Firebase configuration and EAS FCM credentials were not supplied. Configure, rebuild and test with two physical devices. |
| Native notification tap from killed app | Requires the above compiled-device test. Routing code is implemented but has not been exercised on a device. |
| PDF/image invoice extraction against real mart invoices | Extraction and mandatory preview/review code are present; only deterministic CSV imports were integration-tested. Test actual scans, correct missing SKUs/dates using CSV. |
| Docker image execution | Docker runtime unavailable; Dockerfile supplied for deployment. |
| Public backend deployment | Vercel workspace authorization and GitHub project linkage succeeded. Turso integration installation is paused before acceptance of the provider and Vercel Marketplace terms. An external durable database and serverless adaptation are still needed. No verified live API URL is available. |
| Actual mart details/catalog | The uploaded real CSV is supported and imported separately. The Google share URL was inaccessible; configure verified address and store details. |
| Real money/payment processing | Checkout is pay-at-mart pickup. No payment gateway integration was requested or implemented. |

Sample catalog data is intended for development. Historical invoice CSV examples are illustrative; they are not imported into the local sample catalog automatically. There are no fabricated sales dashboards or live revenue claims.
