# SwilERP integration for Aone Mart

Use SwilERP as the authority for products, prices, physical stock and counter
invoices. Aone Mart keeps customer accounts, online orders, reservations and
rewards. The goal is automatic stock and sales updates without a daily export
and upload routine.

## Vendor support and information needed

SWIL's [official integration page](https://www.swindia.com/solutions/business-automation-and-integration),
checked on 5 October 2026, describes stock/invoice exchange through SwilUnify
and project-led third-party APIs. It also states that availability varies by
edition and deployment. This establishes an integration option, but does not
establish API access for this store's licence or a public endpoint contract.

Confirm these with the store/SWIL before building the vendor adapter:

- Exact product, version, licence and whether it runs on a store PC or in the cloud.
- Supported API/connector, documentation, authentication, sandbox access, limits
  and any extra integration charge.
- Product ID, branch/godown, unit conversion and whether stock means physical
  on-hand, available-to-sell or stock after ERP reservations.
- Invoice IDs and financial-year numbering, item lines, payments, returns,
  cancellations, amended invoices and an updated-since cursor or change feed.
- How online orders should appear in SwilERP, and how its final invoice will
  reference the Aone order ID. The initial integration should read ERP data;
  writing orders/invoices needs a documented vendor-supported contract.

Suggested support request (prepared text; not sent):

> We use SwilERP for Aone Mart billing and inventory. We have a custom Android
> app and Node backend. Please confirm the supported API or SwilUnify connector
> for our version/licence, including access to item masters, branch-wise stock,
> sales invoices, returns and cancellations. We need automatic incremental
> synchronization and stable IDs, and later want online orders linked to ERP
> billing. Please share the API docs, authentication/sandbox setup, limits and
> integration pricing.

## Recommended connection

| Store setup | Implementation |
| --- | --- |
| Vendor-supported API reachable from the backend | A scheduled worker fetches changes, validates them and writes an authenticated sync batch to Aone. Use webhooks only if the vendor supports them, with periodic reconciliation. |
| Desktop API accessible only on the store LAN | A small service on the store PC polls the supported local API and sends HTTPS batches outward to Aone. The PC needs to be running and online. |
| No supported API | Ask SWIL for a supported read-only database view or scheduled export. A PC service reads that view or watches the export folder and uploads automatically. Automated export itself must be supported/configured; a folder watcher cannot produce the export. |

Start with a configurable polling interval, for example five minutes, after
confirming API limits. Show the last successful sync time and errors in Admin.
Use outbound HTTPS from the PC; keep credentials in the service/backend rather
than the Android app. A serverless request cannot host a persistent desktop
connector or an always-running polling loop.

## Changes required in the current app

The app already accepts the mart's inventory CSV columns and bill-wise sales
summaries through authenticated preview/commit endpoints. These are useful for
initial reconciliation, but are not yet a recurring sync API:

- Re-importing an identical file is blocked by its checksum. Already-existing
  invoice numbers are validation errors, so a daily report containing yesterday's
  invoices cannot be replayed as an incremental update.
- Product CSV import updates absolute stock while preserving active app
  reservations; it blocks a snapshot below the currently reserved quantity.
- Invoice imports normally leave stock unchanged. Sales summaries lack item
  quantities and costs and cannot support product-level profit or stock changes.
- Picking up an app order currently creates `INV-<order number>` and reduces
  stock. Importing a differently numbered SwilERP invoice for the same purchase
  would count its revenue a second time.

Build a separate adapter and sync ingestion flow with the following contract:

1. Map ERP product IDs to Aone products explicitly, including barcode-less
   products. Reconcile branch and unit mappings before accepting stock.
2. Import absolute ERP physical stock, then calculate online availability using
   app reservations exactly once. If ERP already subtracts those reservations,
   use the documented alternative mapping. Reject and surface conflicts rather
   than losing reservations or enabling overselling.
3. Upsert invoices by ERP company/branch/financial-year/invoice ID. Track source
   version and changes so retries, amendments, cancellations and returns have
   defined outcomes. An invoice batch must not deduct stock that is already
   reflected in an imported ERP snapshot.
4. Link ERP bills to app orders before including them in revenue. Replace/link
   the app pickup invoice instead of appending the same sale under another
   number. Do not award loyalty points twice. Avoid applying an older ERP stock
   snapshot over app pickups that the ERP has not posted yet.
5. Validate each batch and commit it atomically. Advance the source cursor only
   after success, retry temporary failures with backoff and retain an audit
   record. Serialize batches per source and do not let stale snapshots overwrite
   newer stock. Use scoped, revocable sync credentials rather than the owner's
   daily login in the long-running service.
6. Reconcile invoice counts, net totals and a stock sample against ERP. Surface
   discrepancies and stale stock to the administrator. Choose a stock-buffer or
   order-pause policy for disconnected periods with the store owner.

## Rollout and acceptance

First test read-only API access and field mapping against a sandbox/sample.
Then compare a full import with the store's ERP totals without making live
inventory changes. Test one counter sale, app pickup, return, cancellation,
invoice amendment, duplicate retry and offline catch-up. Specifically check
that each sale appears once and each stock movement applies once.

Enable recurring sync only after those checks and source credentials are ready.
This proposal does not contain vendor endpoints, configured credentials or an
enabled production schedule; those depend on the store's version/licence and
SWIL's supported interface.
