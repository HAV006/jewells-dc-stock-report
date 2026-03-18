# Jewells DC Stock Report Frontend

## Files
- `dc_stock_index.html`
- `dc_stock_app.js`

## Expected Worker endpoint
The frontend reads the JSON report from:

`/dc-stock-report`

Current default configured in `dc_stock_app.js`:

`https://sweet-disk-29c8.hectora-b43.workers.dev/dc-stock-report`

## Recommended GitHub repo structure

```text
/
  index.html
  app.js
```

Rename before upload:
- `dc_stock_index.html` -> `index.html`
- `dc_stock_app.js` -> `app.js`

## Cloudflare Pages
- Framework preset: `None`
- Build command: *(leave empty)*
- Build output directory: `/`

## Optional customisation
You can override the API URL by defining `window.DC_REPORT_URL` before loading `app.js`.
