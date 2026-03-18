const DC_REPORT_URL = window.DC_REPORT_URL || "https://sweet-disk-29c8.hectora-b43.workers.dev/dc-stock-report";
const DEFAULT_PRODUCT_IMAGE_URL = "https://jewells-com.s3.amazonaws.com/Logo/logo-red.png";

let raw = null;
let rows = [];
let filtered = [];
let page = 1;
let pageSize = 100;

const el = (id) => document.getElementById(id);

function fmtGBP(x){
  const n = Number(x || 0);
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtNum(x, digits = 0){
  const n = Number(x || 0);
  return n.toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function escapeHtml(v){
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeData(payload){
  const data = payload?.data || [];

  return data.map((r) => ({
    Warehouse: String(r.Warehouse ?? r.warehouse ?? ""),
    WarehouseLabel: String(r.WarehouseLabel ?? r.warehouselabel ?? ""),
    SKU: String(r.SKU ?? r.sku ?? "").trim(),
    SOH: Number(r.SOH ?? r.soh ?? 0),
    DELTA: Number(r.DELTA ?? r.delta ?? 0),
    AVAIL_INV: Number(r.AVAIL_INV ?? r.avail_inv ?? 0),
    LPUnitCostGBP: Number(r.LPUnitCostGBP ?? r.lpunitcostgbp ?? 0),
    InventoryValueSOH: Number(r.InventoryValueSOH ?? r.inventoryvaluesoh ?? 0),
    InventoryValueAvailInv: Number(r.InventoryValueAvailInv ?? r.inventoryvalueavailinv ?? 0),
    CostSource: String(r.CostSource ?? r.costsource ?? ""),
    CostMissingFlag: Boolean(r.CostMissingFlag ?? r.costmissingflag ?? false),
    LPBusinessDate: String(r.LPBusinessDate ?? r.lpbusinessdate ?? ""),
    LPGeneratedAt: String(r.LPGeneratedAt ?? r.lpgeneratedat ?? ""),
    LPRemoteFilename: String(r.LPRemoteFilename ?? r.lpremotefilename ?? ""),
    ProductImageFile: String(r.ProductImageFile ?? r.productimagefile ?? "logo-red.png"),
    ProductImageUrl: String(r.ProductImageUrl ?? r.productimageurl ?? DEFAULT_PRODUCT_IMAGE_URL),
    ProductImageMatchType: String(r.ProductImageMatchType ?? r.productimagematchtype ?? "fallback"),
    CatalogUrl: String(r.CatalogUrl ?? r.catalogurl ?? ""),
  }));
}

function updateKpis(data){
  const totalSOH = data.reduce((a, r) => a + Number(r.SOH || 0), 0);
  const totalAvail = data.reduce((a, r) => a + Number(r.AVAIL_INV || 0), 0);
  const totalValueSOH = data.reduce((a, r) => a + Number(r.InventoryValueSOH || 0), 0);
  const totalValueAvail = data.reduce((a, r) => a + Number(r.InventoryValueAvailInv || 0), 0);
  const missing = data.filter(r => r.CostMissingFlag).length;

  el("kpiRows").textContent = fmtNum(data.length);
  el("kpiSOH").textContent = fmtNum(totalSOH);
  el("kpiAvail").textContent = fmtNum(totalAvail);
  el("kpiValueSOH").textContent = fmtGBP(totalValueSOH);
  el("kpiValueAvail").textContent = fmtGBP(totalValueAvail);
  el("kpiMissing").textContent = fmtNum(missing);
}

function applyFilters(){
  const q = (el("q").value || "").trim().toLowerCase();
  const missingOnly = el("missingOnly").value;
  const sortBy = el("sortBy").value;

  filtered = rows.filter(r => {
    const matchesQ = !q || r.SKU.toLowerCase().includes(q) || r.Warehouse.toLowerCase().includes(q);
    const matchesMissing =
      missingOnly === "all" ? true :
      missingOnly === "missing" ? r.CostMissingFlag :
      !r.CostMissingFlag;
    return matchesQ && matchesMissing;
  });

  filtered.sort((a, b) => {
    if (sortBy === "soh_desc") return Number(b.SOH || 0) - Number(a.SOH || 0) || a.SKU.localeCompare(b.SKU);
    if (sortBy === "avail_desc") return Number(b.AVAIL_INV || 0) - Number(a.AVAIL_INV || 0) || a.SKU.localeCompare(b.SKU);
    if (sortBy === "value_desc") return Number(b.InventoryValueAvailInv || 0) - Number(a.InventoryValueAvailInv || 0) || a.SKU.localeCompare(b.SKU);
    return a.SKU.localeCompare(b.SKU);
  });

  page = 1;
  updateKpis(filtered);
  renderTable();
}

function renderTable(){
  const tbody = el("tbody");
  const tableWrap = el("tableWrap");
  const empty = el("empty");

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (page > totalPages) page = totalPages;

  const start = (page - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  if (!pageRows.length){
    tbody.innerHTML = "";
    tableWrap.hidden = true;
    empty.hidden = false;
  } else {
    tableWrap.hidden = false;
    empty.hidden = true;

    tbody.innerHTML = pageRows.map(r => {
      const img = escapeHtml(r.ProductImageUrl || DEFAULT_PRODUCT_IMAGE_URL);
      const sku = escapeHtml(r.SKU);
      const catalogUrl = escapeHtml(r.CatalogUrl || "#");
      const costClass = r.CostMissingFlag ? "bad" : "ok";
      const costText = r.CostMissingFlag ? "Yes" : "No";

      return `
        <tr>
          <td class="center"><img class="thumb" src="${img}" alt="${sku}" loading="lazy"></td>
          <td>${escapeHtml(r.Warehouse)}</td>
          <td><a class="sku-link mono" href="${catalogUrl}" target="_blank" rel="noreferrer">${sku}</a></td>
          <td class="num">${fmtNum(r.SOH)}</td>
          <td class="num">${fmtNum(r.DELTA)}</td>
          <td class="num">${fmtNum(r.AVAIL_INV)}</td>
          <td class="num">${fmtGBP(r.LPUnitCostGBP)}</td>
          <td class="num">${fmtGBP(r.InventoryValueSOH)}</td>
          <td class="num">${fmtGBP(r.InventoryValueAvailInv)}</td>
          <td>${escapeHtml(r.CostSource)}</td>
          <td class="center"><span class="flag ${costClass}">${costText}</span></td>
          <td>${escapeHtml(r.LPBusinessDate)}</td>
          <td>${escapeHtml(r.LPGeneratedAt)}</td>
        </tr>
      `;
    }).join("");
  }

  el("pageInfo").textContent = `Page ${page} of ${Math.max(1, totalPages)} · ${fmtNum(filtered.length)} rows`;
  el("prevBtn").disabled = page <= 1;
  el("nextBtn").disabled = page >= totalPages;
}

function nowStamp(){
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function csvEscape(v){
  if (v === null || v === undefined) return "";
  const s = String(v);
  const needs = /[",\n\r]/.test(s);
  const out = s.replace(/"/g, '""');
  return needs ? `"${out}"` : out;
}

function downloadBlob(filename, blob){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function exportCsv(){
  if (!filtered.length){
    alert("No rows to export.");
    return;
  }

  const data = filtered.map(r => ({
    Warehouse: r.Warehouse,
    SKU: r.SKU,
    CatalogUrl: r.CatalogUrl,
    SOH: r.SOH,
    DELTA: r.DELTA,
    AVAIL_INV: r.AVAIL_INV,
    LPUnitCostGBP: r.LPUnitCostGBP,
    InventoryValueSOH: r.InventoryValueSOH,
    InventoryValueAvailInv: r.InventoryValueAvailInv,
    CostSource: r.CostSource,
    CostMissingFlag: r.CostMissingFlag,
    LPBusinessDate: r.LPBusinessDate,
    LPGeneratedAt: r.LPGeneratedAt,
  }));

  const headers = Object.keys(data[0]);
  const lines = ["sep=,", headers.join(",")];
  for (const row of data){
    lines.push(headers.map(h => csvEscape(row[h])).join(","));
  }
  const csv = "\ufeff" + lines.join("\n");
  downloadBlob(`dc_stock_report_${nowStamp()}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

async function loadData(){
  const status = el("status");
  status.textContent = `Loading ${DC_REPORT_URL} ...`;

  try {
    const res = await fetch(DC_REPORT_URL, { cache: "no-store" });
    if (!res.ok){
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }

    raw = await res.json();
    rows = normalizeData(raw);
    filtered = [...rows];

    el("generatedAt").textContent = raw?.generated_at_utc
      ? `Generated at ${raw.generated_at_utc}`
      : `Rows ${fmtNum(rows.length)}`;

    updateKpis(filtered);
    renderTable();
    status.textContent = `${fmtNum(rows.length)} rows loaded`;
  } catch (err) {
    console.error(err);
    el("tableWrap").hidden = true;
    el("empty").hidden = true;
    status.innerHTML = `<div class="error">Failed to load report: ${escapeHtml(err.message)}</div>`;
  }
}

function bindEvents(){
  el("q").addEventListener("input", applyFilters);
  el("missingOnly").addEventListener("change", applyFilters);
  el("sortBy").addEventListener("change", applyFilters);

  el("pageSize").addEventListener("change", () => {
    pageSize = Number(el("pageSize").value || 100);
    page = 1;
    renderTable();
  });

  el("prevBtn").addEventListener("click", () => {
    if (page > 1){
      page -= 1;
      renderTable();
    }
  });

  el("nextBtn").addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page < totalPages){
      page += 1;
      renderTable();
    }
  });

  el("exportBtn").addEventListener("click", exportCsv);
  el("refreshBtn").addEventListener("click", loadData);

  el("btnApply").addEventListener("click", applyFilters);

  el("btnReset").addEventListener("click", () => {
    el("q").value = "";
    el("missingOnly").value = "all";
    el("sortBy").value = "sku";
    page = 1;
    applyFilters();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadData();
});