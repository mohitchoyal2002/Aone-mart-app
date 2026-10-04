# Aone Mart UI and interaction decisions

The audience is a neighbourhood mart's rural customer base. Rural location does not imply low literacy: the design supports both experienced shoppers and people who are new to app-based ordering. These are design hypotheses informed by published research, not findings from interviews with Aone customers.

## Research applied

Microsoft Research's studies of novice and low-literacy users found barriers with text-heavy interfaces and benefits from graphical cues in the studied tasks. This supports recognisable product pictures, explicit text labels, visible quantities and shallow navigation. It does not establish that a specific colour will improve rural grocery conversion.

- [Designing Mobile Interfaces for Novice and Low-Literacy Users](https://www.microsoft.com/en-us/research/publication/designing-mobile-interfaces-for-novice-and-low-literacy-users/) (2011).
- [Sophistication with Limitation: Understanding Smartphone Usage by Emergent Users in India](https://www.microsoft.com/en-us/research/?p=839809) (2022): motivations, infrastructure and literacy vary among emergent users.
- [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): 4.5:1 for ordinary text, 3:1 for large text.
- [W3C target size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced): 44×44 CSS-pixel enhanced target reference. Native main buttons, add-to-cart and quantity controls use 48-point height; carousel arrows have 44-point targets.
- [W3C pause guidance](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide): persistent automatic motion needs user control. Carousel and 3D animation have pause controls, stop when inactive and respect reduced motion.

## Appearance and psychology

| Choice | Reason and implementation |
| --- | --- |
| Warm cream background | Calm backdrop and clear separation between products. A visual design choice, not a claimed universal psychological effect. |
| Dark green text and primary actions | A consistent recognisable store identity, with contrast checked against the cream/white surfaces. |
| Gold, pale blue and lilac accents | Distinguish offers and report cards without adding several competing primary actions. |
| DM Sans, stronger secondary text | Existing bundled font retained; product names/units enlarged and muted text darkened. System font scaling remains enabled. |
| Basket and leaf emblem | Familiar shopping shape, reused across icon, startup, branding and loading feedback. |
| Labelled customer tabs and visible add controls | Recognition reduces the need to remember where actions are. Price, pack size and stock remain visible. |
| Explicit pickup/payment copy | “Choose your essentials. Pick up at the mart. Pay at the counter.” explains the actual fulfilment model before checkout. No fabricated delivery claims or scarcity. |
| Consistent dialogs | Confirmations, failures, destructive actions and stock limits use app colours, readable copy and labelled actions. Android's file/photo picker, sharing and OS permission UI remain system controls. |

Hindi/Hinglish is used sparingly in branding (“Apni dukaan. Apna bharosa.”). This release does not claim full Hindi localisation. Validate whether Hindi, English or a selectable language better suits actual shoppers before translating all transactional content.

## Motion and performance

- Local 1.92-second logo GIF replaces app-owned progress spinners. Static logo appears with reduced motion or while backgrounded.
- Startup keeps the native splash until fonts are ready, then transitions through the same animated identity while restoring the session. It does not impose a long splash delay on an already-ready app.
- Native press springs, page entrance and navigator fade transitions provide lightweight feedback.
- A procedural Three.js shopping basket, fruit and milk carton render through Expo GL. Anime.js animates plain object transforms; the frame loop caps rendering at approximately 30 fps.
- GL surfaces unmount on pause, reduced motion, inactive app, inactive tab and when the hero scrolls out of view. Geometries, materials, animation instances and frame callbacks are cleaned up. Failed GL rendering falls back to the logo.
- No remote 3D models, video or texture downloads. Uploaded banner images are compressed before sending and resized/re-encoded on the server; image caches avoid downloading them on each render.
- Anime.js 4.5.0's window/DOM environment check is patched in a reproducible postinstall script because React Native supplies `window` without a browser document. This patch leaves the browser path intact and uses only object animation in native code.

## Import and banner behaviour

- Bill-summary CSVs such as `Bill No.,Customer,Received Amount,...,Net Amount,RefDate` are accepted by Sales & Invoices.
- Valid dates are mandatory. Net Amount becomes revenue; original payment/customer columns are retained. Missing SKU lines, product quantities, costs and rewards are never invented. Inventory adjustment is blocked for summaries; summary revenue is excluded from profit and item/product reports.
- Duplicate file and bill checks, preview review and atomic commit remain in place.
- Store Settings uploads, replaces and reorders 1–5 banner images. A built-in basket banner is shown until the first upload. At least one uploaded banner must remain. Admin permission and limits are enforced server-side.
- Carousel images use containment so offer text is not cropped. Swiping/navigation pauses automatic advance; users can restart it. Advance interval is 6.5 seconds. Screen-reader descriptions come from admin-supplied alt text.

## Validation and remaining research

Automated checks cover summary amounts/date validation, duplicate imports, unchanged stock/rewards, accurate report exclusions, image decoding, public image reads, admin-only writes, replacements, reordering and concurrent 1–5 enforcement. The uploaded POS-style sales-summary CSV validated locally with zero errors. Actual store data is not included as a repository fixture or automatically imported into production.

Run device checks against the built APK for startup, a failed-login dialog, the shopping/checkout flow, large text, a narrow phone, tablet layout and gallery/file upload. Performance on entry-level physical devices and acceptance by local shoppers still need real-device/user evaluation. A useful follow-up study is 5–8 shoppers completing search → add → pickup order, measuring errors and comprehension of where/when payment happens. Do not describe this as a conducted usability study.

## Admin analytics

The dashboard compares equal-length periods in India time and supports interactive net-revenue or bill-count trends with daily or seven-day grouping. It includes sales-source and category share charts, weekday totals, separate top-product rankings by units and gross sales, purchasing-account repeat rate, pickup order status, and current stock health. Exact values accompany charts and point controls are at least 44 dp high.

Bill summaries contribute to revenue, bill count, weekday patterns and average bill value. They are excluded from itemized product/category sales and the itemized profit estimate because they lack product quantities and costs. Repeat rate includes only invoices linked to customer accounts. Inventory figures are current snapshots and explicitly do not use the date filter. Percentage growth is unavailable when the previous total is zero; the UI labels this as new activity or no sales.

Tests cover equal-period boundaries, India midnight, source totals, repeat-customer scope, summary exclusions, empty periods, authorization and invalid dates. Native smoke coverage also checks daily/weekly chart controls and product ranking controls.
