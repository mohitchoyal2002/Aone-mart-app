# Verification record — 4 October 2026

## Completed checks

| Check | Result and scope |
| --- | --- |
| Backend integration suite | **22/22 passed**, no skipped tests; isolated in-memory SQLite database |
| Backend TypeScript | Passed |
| Mobile TypeScript | Passed |
| Native mobile ESLint | Passed, no errors or warnings |
| Backend build | `tsc` compiled all API modules successfully |
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
| Installable APK or AAB | Android SDK 36, NDK and Gradle installed. Local native compilation reached module configuration before Maven network policy blocked further access. GitHub write access is verified and a cloud APK workflow is supplied. APK completion requires a successful workflow run. |
| Phone/tablet visual and interaction QA | Emulator tools and an Android 36 system image are installed; an APK has not yet been launched. Test small-screen layouts, keyboards, modals, cart and admin tables on devices. |
| Background notification/tone delivery | Expo project ID, Android Firebase configuration and EAS FCM credentials were not supplied. Configure, rebuild and test with two physical devices. |
| Native notification tap from killed app | Requires the above compiled-device test. Routing code is implemented but has not been exercised on a device. |
| PDF/image invoice extraction against real mart invoices | Extraction and mandatory preview/review code are present; only deterministic CSV imports were integration-tested. Test actual scans, correct missing SKUs/dates using CSV. |
| Docker image execution | Docker runtime unavailable; Dockerfile supplied for deployment. |
| Public backend deployment | User chose a VPS; server IP/domain and SSH access have not been supplied. Deployment files are ready. |
| Actual mart details/catalog | Google share URL was inaccessible; configure verified information and import the real catalog. |
| Real money/payment processing | Checkout is pay-at-mart pickup. No payment gateway integration was requested or implemented. |

Sample catalog data is intended for development. Historical invoice CSV examples are illustrative; they are not imported into the local sample catalog automatically. There are no fabricated sales dashboards or live revenue claims.
