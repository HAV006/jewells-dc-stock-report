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

function fmtSignedNum(x){
  const n = Number(x || 0);
  const abs = fmtNum(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

function fmtPct(x, digits = 1){
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "—";
  const n = Number(x || 0);
  return `${n.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function escapeHtml(v){
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readNumber(source, keys, defaultValue = 0){
  for (const key of keys){
    if (source[key] !== undefined && source[key] !== null && source[key] !== ""){
      const n = Number(source[key]);
      return Number.isFinite(n) ? n : defaultValue;
    }
  }
  return defaultValue;
}

function hasAnyField(source, keys){
  return keys.some((key) => source[key] !== undefined && source[key] !== null && source[key] !== "");
}

function discrepancyBucket(soh, lp){
  if (soh === lp) return "match";
  if (soh > 0 && lp === 0) return "soh_only";
  if (soh === 0 && lp > 0) return "lp_only";
  if (soh > lp) return "soh_above";
  return "soh_below";
}

function statusLabel(bucket){
  switch (bucket){
    case "match": return "Match";
    case "soh_above": return "SOH > LP";
    case "soh_below": return "SOH < LP";
    case "soh_only": return "SOH only";
    case "lp_only": return "LP only";
    default: return "Unknown";
  }
}

function normalizeData(payload){
  const data = payload?.data || [];

  return data.map((r) => {
    const soh = readNumber(r, ["SOH", "soh"]);
    const lpdc = readNumber(r, ["GLDCTotal", "GL_DC_TOTAL", "GL_DC_Total", "gl_dc_total", "gldctotal"]);
    const unitCost = readNumber(r, ["LPUnitCostGBP", "lpunitcostgbp", "PP", "pp"]);
    const invValueSOH = hasAnyField(r, ["InventoryValueSOH", "inventoryvaluesoh"])
      ? readNumber(r, ["InventoryValueSOH", "inventoryvaluesoh"])
      : soh * unitCost;
    const invValueLP = hasAnyField(r, ["InventoryValueGLDC", "inventoryvaluegldc", "InventoryValueLP", "inventoryvaluelp"])
      ? readNumber(r, ["InventoryValueGLDC", "inventoryvaluegldc", "InventoryValueLP", "inventoryvaluelp"])
      : lpdc * unitCost;

    const bucket = discrepancyBucket(soh, lpdc);
    const qtyGap = soh - lpdc;
    const pctGap = lpdc > 0 ? (qtyGap / lpdc) * 100 : (soh > 0 ? 100 : 0);

    return {
      Warehouse: String(r.Warehouse ?? r.warehouse ?? ""),
      WarehouseLabel: String(r.WarehouseLabel ?? r.warehouselabel ?? ""),
      SKU: String(r.SKU ?? r.sku ?? "").trim(),
      SOH: soh,
      GLDCTotal: lpdc,
      DELTA: readNumber(r, ["DELTA", "delta"]),
      LPUnitCostGBP: unitCost,
      InventoryValueSOH: invValueSOH,
      InventoryValueLP: invValueLP,
      QtyGap: qtyGap,
      GapPct: pctGap,
      DiscrepancyBucket: bucket,
      CostMissingFlag: Boolean(r.CostMissingFlag ?? r.costmissingflag ?? false),
      ProductImageFile: String(r.ProductImageFile ?? r.productimagefile ?? "logo-red.png"),
      ProductImageUrl: String(r.ProductImageUrl ?? r.productimageurl ?? DEFAULT_PRODUCT_IMAGE_URL),
      ProductImageMatchType: String(r.ProductImageMatchType ?? r.productimagematchtype ?? "fallback"),
      CatalogUrl: String(r.CatalogUrl ?? r.catalogurl ?? ""),
      HasLPDC: hasAnyField(r, ["GLDCTotal", "GL_DC_TOTAL", "GL_DC_Total", "gl_dc_total", "gldctotal"]),
    };
  });
}

function summarize(data){
  const totalSOH = data.reduce((a, r) => a + Number(r.SOH || 0), 0);
  const totalLPDC = data.reduce((a, r) => a + Number(r.GLDCTotal || 0), 0);
  const totalValueSOH = data.reduce((a, r) => a + Number(r.InventoryValueSOH || 0), 0);
  const totalValueLP = data.reduce((a, r) => a + Number(r.InventoryValueLP || 0), 0);
  const gapQty = totalSOH - totalLPDC;
  const gapValue = totalValueSOH - totalValueLP;
  const discrepancyCount = data.filter(r => r.DiscrepancyBucket !== "match").length;
  const missing = data.filter(r => r.CostMissingFlag).length;
  const matchCount = data.filter(r => r.DiscrepancyBucket === "match").length;
  const sohAboveCount = data.filter(r => r.DiscrepancyBucket === "soh_above").length;
  const sohBelowCount = data.filter(r => r.DiscrepancyBucket === "soh_below").length;
  const sohOnlyCount = data.filter(r => r.DiscrepancyBucket === "soh_only").length;
  const lpOnlyCount = data.filter(r => r.DiscrepancyBucket === "lp_only").length;
  return {
    totalSOH,
    totalLPDC,
    totalValueSOH,
    totalValueLP,
    gapQty,
    gapPct: totalLPDC > 0 ? (gapQty / totalLPDC) * 100 : (totalSOH > 0 ? 100 : 0),
    gapValue,
    discrepancyCount,
    missing,
    matchCount,
    sohAboveCount,
    sohBelowCount,
    sohOnlyCount,
    lpOnlyCount,
    matchRate: data.length ? (matchCount / data.length) * 100 : 0,
    hasLPDC: data.some(r => r.HasLPDC),
  };
}

function applyValueClass(node, value){
  node.classList.remove("warm", "cool", "good");
  if (value > 0) node.classList.add("warm");
  else if (value < 0) node.classList.add("cool");
  else node.classList.add("good");
}

function updateKpis(data){
  const s = summarize(data);

  el("kpiRows").textContent = fmtNum(data.length);
  el("kpiSOH").textContent = fmtNum(s.totalSOH);
  el("kpiValueSOH").textContent = fmtGBP(s.totalValueSOH);
  el("kpiMissing").textContent = fmtNum(s.missing);

  el("kpiLPDC").textContent = s.hasLPDC ? fmtNum(s.totalLPDC) : "—";
  el("kpiGapQty").textContent = s.hasLPDC ? fmtSignedNum(s.gapQty) : "—";
  el("kpiGapPct").textContent = s.hasLPDC ? fmtPct(s.gapPct) : "—";
  el("kpiValueLP").textContent = s.hasLPDC ? fmtGBP(s.totalValueLP) : "—";
  el("kpiGapValue").textContent = s.hasLPDC ? fmtGBP(s.gapValue) : "—";
  el("kpiDiscrepancies").textContent = s.hasLPDC ? fmtNum(s.discrepancyCount) : "—";
  el("kpiMatchRate").textContent = s.hasLPDC ? `Match rate ${fmtPct(s.matchRate)}` : "Waiting for LP fields";

  if (s.hasLPDC){
    applyValueClass(el("kpiGapQty"), s.gapQty);
    applyValueClass(el("kpiGapPct"), s.gapPct);
    applyValueClass(el("kpiGapValue"), s.gapValue);
  }

  const summaryHeadline = el("summaryHeadline");
  const summarySubcopy = el("summarySubcopy");
  const summaryChips = el("summaryChips");

  if (!s.hasLPDC){
    summaryHeadline.textContent = `SOH total ${fmtNum(s.totalSOH)} units across ${fmtNum(data.length)} SKUs.`;
    summarySubcopy.textContent = "LP reconciliation fields are not available yet in the API response.";
    summaryChips.innerHTML = `<span class="chip">SOH primary view active</span><span class="chip">LP comparison pending payload update</span>`;
  } else {
    const direction = s.gapQty >= 0 ? "above" : "below";
    summaryHeadline.textContent = `SOH total ${fmtNum(s.totalSOH)} units. LP DC total ${fmtNum(s.totalLPDC)} units.`;
    summarySubcopy.textContent = `SOH is ${direction} LP by ${fmtSignedNum(s.gapQty)} units (${fmtPct(Math.abs(s.gapPct))}). ${fmtNum(s.discrepancyCount)} SKUs show a discrepancy.`;
    summaryChips.innerHTML = `
      <span class="chip">${fmtNum(s.matchCount)} match</span>
      <span class="chip">${fmtNum(s.sohAboveCount)} SOH &gt; LP</span>
      <span class="chip">${fmtNum(s.sohBelowCount)} SOH &lt; LP</span>
      <span class="chip">${fmtNum(s.sohOnlyCount)} SOH only</span>
      <span class="chip">${fmtNum(s.lpOnlyCount)} LP only</span>
    `;
  }

  el("contractWarning").hidden = s.hasLPDC;
}

function applyFilters(){
  const q = (el("q").value || "").trim().toLowerCase();
  const statusOnly = el("statusOnly").value;
  const costOnly = el("costOnly").value;
  const sortBy = el("sortBy").value;
  const discrepanciesOnly = el("discrepanciesOnly").checked;

  filtered = rows.filter((r) => {
    const matchesQ = !q ||
      r.SKU.toLowerCase().includes(q) ||
      r.Warehouse.toLowerCase().includes(q) ||
      statusLabel(r.DiscrepancyBucket).toLowerCase().includes(q);

    const matchesStatus = statusOnly === "all" ? true : r.DiscrepancyBucket === statusOnly;
    const matchesCost = costOnly === "all" ? true : costOnly === "missing" ? r.CostMissingFlag : !r.CostMissingFlag;
    const matchesDiscrepancy = discrepanciesOnly ? r.DiscrepancyBucket !== "match" : true;

    return matchesQ && matchesStatus && matchesCost && matchesDiscrepancy;
  });

  filtered.sort((a, b) => {
    if (sortBy === "soh_desc") return Number(b.SOH || 0) - Number(a.SOH || 0) || a.SKU.localeCompare(b.SKU);
    if (sortBy === "lpdc_desc") return Number(b.GLDCTotal || 0) - Number(a.GLDCTotal || 0) || a.SKU.localeCompare(b.SKU);
    if (sortBy === "gap_abs_desc") return Math.abs(b.QtyGap) - Math.abs(a.QtyGap) || a.SKU.localeCompare(b.SKU);
    if (sortBy === "gap_desc") return Number(b.QtyGap || 0) - Number(a.QtyGap || 0) || a.SKU.localeCompare(b.SKU);
    if (sortBy === "gap_asc") return Number(a.QtyGap || 0) - Number(b.QtyGap || 0) || a.SKU.localeCompare(b.SKU);
    if (sortBy === "value_soh_desc") return Number(b.InventoryValueSOH || 0) - Number(a.InventoryValueSOH || 0) || a.SKU.localeCompare(b.SKU);
    if (sortBy === "value_gap_desc") {
      const aValueGap = Number(a.InventoryValueSOH || 0) - Number(a.InventoryValueLP || 0);
      const bValueGap = Number(b.InventoryValueSOH || 0) - Number(b.InventoryValueLP || 0);
      return Math.abs(bValueGap) - Math.abs(aValueGap) || a.SKU.localeCompare(b.SKU);
    }
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

    tbody.innerHTML = pageRows.map((r) => {
      const img = escapeHtml(r.ProductImageUrl || DEFAULT_PRODUCT_IMAGE_URL);
      const sku = escapeHtml(r.SKU);
      const catalogUrl = escapeHtml(r.CatalogUrl || "#");
      const costClass = r.CostMissingFlag ? "bad" : "ok";
      const costText = r.CostMissingFlag ? "Yes" : "No";
      const bucketClass = r.DiscrepancyBucket.replaceAll("_", "-");
      const bucketText = statusLabel(r.DiscrepancyBucket);
      const gapClass = r.QtyGap > 0 ? "txt-warm" : r.QtyGap < 0 ? "txt-cool" : "txt-neutral";
      const gapPct = r.HasLPDC ? fmtPct(r.GapPct) : "—";
      const lpdc = r.HasLPDC ? fmtNum(r.GLDCTotal) : "—";
      const invValueLP = r.HasLPDC ? fmtGBP(r.InventoryValueLP) : "—";

      return `
        <tr>
          <td class="center"><img class="thumb" src="${img}" alt="${sku}" loading="lazy"></td>
          <td>${escapeHtml(r.Warehouse)}</td>
          <td><a class="sku-link mono" href="${catalogUrl}" target="_blank" rel="noreferrer">${sku}</a></td>
          <td class="num">${fmtNum(r.SOH)}</td>
          <td class="num">${lpdc}</td>
          <td class="num ${gapClass}">${r.HasLPDC ? fmtSignedNum(r.QtyGap) : "—"}</td>
          <td class="num ${gapClass}">${gapPct}</td>
          <td class="num">${fmtGBP(r.LPUnitCostGBP)}</td>
          <td class="num">${fmtGBP(r.InventoryValueSOH)}</td>
          <td class="num">${invValueLP}</td>
          <td class="center"><span class="tag ${bucketClass}">${bucketText}</span></td>
          <td class="center"><span class="flag ${costClass}">${costText}</span></td>
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

  const data = filtered.map((r) => ({
    Warehouse: r.Warehouse,
    SKU: r.SKU,
    CatalogUrl: r.CatalogUrl,
    SOH: r.SOH,
    GLDCTotal: r.GLDCTotal,
    QtyGap: r.QtyGap,
    GapPct: r.GapPct,
    LPUnitCostGBP: r.LPUnitCostGBP,
    InventoryValueSOH: r.InventoryValueSOH,
    InventoryValueLP: r.InventoryValueLP,
    DiscrepancyBucket: r.DiscrepancyBucket,
    CostMissingFlag: r.CostMissingFlag,
  }));

  const headers = Object.keys(data[0]);
  const lines = ["sep=,", headers.join(",")];
  for (const row of data){
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  const csv = "\ufeff" + lines.join("\n");
  downloadBlob(`dc_stock_report_soh_primary_${nowStamp()}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
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

    const updatedAt = raw?.updated_at_utc || raw?.updated_at || raw?.worker_updated_at_utc || raw?.last_updated_at_utc || raw?.kv_updated_at_utc || null;
    const executedAt = raw?.execution_completed_at_utc || raw?.executed_at_utc || raw?.run_completed_at_utc || raw?.generated_at_utc || null;

    let timestampLabel = `Rows ${fmtNum(rows.length)}`;
    if (updatedAt && executedAt){
      timestampLabel = `Updated at ${updatedAt} · Executed at ${executedAt}`;
    } else if (updatedAt){
      timestampLabel = `Updated at ${updatedAt}`;
    } else if (executedAt){
      timestampLabel = `Executed at ${executedAt}`;
    }

    el("reportTimestamps").textContent = timestampLabel;

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
  el("statusOnly").addEventListener("change", applyFilters);
  el("costOnly").addEventListener("change", applyFilters);
  el("sortBy").addEventListener("change", applyFilters);
  el("discrepanciesOnly").addEventListener("change", applyFilters);

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
    el("statusOnly").value = "all";
    el("costOnly").value = "all";
    el("sortBy").value = "sku";
    el("discrepanciesOnly").checked = false;
    page = 1;
    applyFilters();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadData();
});
