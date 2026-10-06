# Product photos

Product cards, the basket and the full product page share one photo resolver.
A merchant photo takes priority, then an exact EAN/UPC lookup, then a product-name
lookup. General grocery/category photos are never substituted for a named product.
Shopping, pricing and stock queries do not wait for external image providers.

## Imported products without EANs

The backend searches the public Quick Pantry storefront catalog, Open Food Facts
and UPCitemdb's free search endpoint. It compares the imported product-name words,
variant, known pack size (including g/kg and ml/l conversions), and explicit
name-based MRP such as `5STAR OREO 20MRP`. It rejects known variant differences,
wrong sizes, multipacks and ambiguous results. It does not invent image URLs or
silently fuzzy-match abbreviations to unrelated brands.

A real public lookup for `420 MOONG PUNJABI MASALA PAPAD` without an EAN resolved
to the Agrawal 420 Moong Papad (Punjabi Masala) product record on 2026-10-06:
https://www.quickpantry.in/products/agrawal-420-moong-papad-200-g.
The result is a name match; an unknown imported pack size cannot establish an
exact pack size. Product details display source and image-rights attribution.

Public catalogs do not cover every local brand. Missing/ambiguous matches show
`Photo unavailable`. They can be completed with the actual merchant photo; other
brands or generated lookalike packaging are not used to fill this gap.

## Actual local-brand photo

In Inventory, edit the product, choose **Upload product photo**, then **Save product**.
The existing Android image picker selects one picture. The client measures and
compresses the upload to fit the 1 MB limit; the server validates the image and
stores a WebP up to 1600 pixels and a separate thumbnail up to 384 pixels in the
permanent database. Each replacement has a new immutable URL. Old URLs remain
available for order snapshots. Merchant photos override automatic matches.

Both POS imports and inventory CSV imports without image URLs retain existing
merchant photos. A nonempty image URL in an inventory CSV can replace one.
Automatic name matches are invalidated when name, unit, SKU or barcode changes.
Exact-barcode photos remain shared by barcode. Merchant photos can be changed
or cleared in the product editor.

## Requests and caching

The authenticated `/api/catalog/product-images` endpoint accepts up to 24 product
IDs; the app batches only visible cards and reuses resolved photos on the detail
page. At most six new name lookups start per request. The backend persists matches
and provider attempts; negative results retry after seven days, temporary failures
after ten minutes, and queued work after at least one minute. Free UPC requests
share a 90/day cap and one request per ten-second burst across both lookup methods.
Open Food Facts query budgets stay below its published search limit. No paid
subscription or new API key is required for this feature.

Source photos may be unavailable or blocked. Failed full-size images try the
same product's thumbnail, then show the unavailable state. The public owned-photo
route serves image bytes only; upload routes require administrator authentication.

## Verification

API integration/unit tests cover name/size/MRP mismatches, ambiguous variants,
provider outages, quotas, positive/negative persistence, name invalidation,
merchant priority, upload permissions/limits, thumbnail dimensions, immutable
replacement URLs, CSV retention, and unchanged stock/reservations/prices.
Local visual verification uses preview-only actual product-photo fixtures that
are excluded from the APK. Android CI runs source checks and native smoke tests.
