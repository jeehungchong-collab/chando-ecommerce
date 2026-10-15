# CHANDO Flash Sale Cycle Tracker

Public Shopee Flash Sale dashboard for four shared 3-day cycles. It tracks
confirmed listing and variation orders, product-level baseline-multiple goals, sales,
units, CTR, CVR, and AOV. Flash PMS is intentionally excluded.

The protected admin workspace accepts Shopee `.xlsx` exports containing the
`Confirmed Order` sheet. Uploads with the same campaign and session period
replace the active revision without double counting; prior revisions remain in
the audit history. Structured data is stored in D1 and original workbooks in R2.

## Local development

```bash
pnpm install
pnpm run dev
```

## Validation

```bash
pnpm run build
node --import tsx --test tests/*.test.mjs
```
