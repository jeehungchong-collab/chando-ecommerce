"use client";

import "./pdf-server-polyfill";
import { ChangeEvent, FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { parseVariationBlock } from "@/lib/lazada-variation";
import PlatformNav from "../platform-nav";


type SkuRecord = {
  id: string;
  listingId: string;
  listingTitle: string;
  sku: string;
  price: number;
  stock: number;
  sales: number;
  periodStart: string;
  periodEnd: string;
  sourceNote: string;
};

type Cycle = {
  cycle: number;
  start: string;
  end: string;
  dates: string[];
};

type CycleMetric = {
  orders: number;
  sales: number;
};

type ListingSummary = {
  listingId: string;
  listingTitle: string;
  records: SkuRecord[];
  cycles: CycleMetric[];
};

type ImportHistory = {
  id: string;
  listingId: string;
  listingTitle: string;
  periodStart: string;
  periodEnd: string;
  sourceFile: string;
  skuRows: number;
  salesCount: number;
  salesValue: number;
  revision: number;
  replaced: boolean;
  status?: string;
  uploadedBy?: string;
  error?: string;
  importedAt: string;
};

type PdfImportDraft = {
  fileName: string;
  listingId: string;
  listingTitle: string;
  periodStart: string;
  periodEnd: string;
  rows: Array<{ sku: string; price: number; stock: number; sales: number }>;
  warnings: string[];
};

const CYCLE_START = "2026-09-02";
const STORAGE_KEY = "chando-lazada-screenshot-tracker-v1";
const HISTORY_STORAGE_KEY = "chando-lazada-screenshot-import-history-v1";
const initialForm = { listingId: "", listingTitle: "", periodStart: "", periodEnd: "", sourceNote: "", bulkRows: "" };

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function toUtcDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
  }).format(toUtcDate(date));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(value.length === 16 ? value + "+08:00" : value));
}

function money(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(value);
}

function integer(value: number) {
  return new Intl.NumberFormat("en-MY").format(value);
}

function cycleForDate(value: string) {
  const start = toUtcDate(CYCLE_START).getTime();
  const date = toUtcDate(dateOnly(value)).getTime();
  const diffDays = Math.floor((date - start) / 86_400_000);
  return Math.max(1, Math.floor(diffDays / 3) + 1);
}

function buildCycles(records: SkuRecord[]) {
  const maxCycle = Math.max(
    4,
    ...records.map((record) => cycleForDate(record.periodStart)),
  );
  return Array.from({ length: maxCycle }, (_, index) => {
    const startDate = addDays(toUtcDate(CYCLE_START), index * 3);
    const endDate = addDays(startDate, 3);
    return {
      cycle: index + 1,
      start: startDate.toISOString().slice(0, 10),
      end: endDate.toISOString().slice(0, 10),
      dates: [0, 1, 2].map((day) =>
        addDays(startDate, day).toISOString().slice(0, 10),
      ),
    };
  });
}

function summarize(records: SkuRecord[], cycles: Cycle[]) {
  const map = new Map<string, ListingSummary>();
  for (const record of records) {
    const key = record.listingId || record.listingTitle;
    if (!map.has(key)) {
      map.set(key, {
        listingId: record.listingId,
        listingTitle: record.listingTitle,
        records: [],
        cycles: cycles.map(() => ({ orders: 0, sales: 0 })),
      });
    }
    const listing = map.get(key)!;
    listing.records.push(record);
    const cycleIndex = cycleForDate(record.periodStart) - 1;
    if (listing.cycles[cycleIndex]) {
      listing.cycles[cycleIndex].orders += record.sales;
      listing.cycles[cycleIndex].sales += record.sales * record.price;
    }
  }
  return [...map.values()].sort((a, b) => {
    const latestA = Math.max(
      ...a.records.map((record) => new Date(record.periodStart).getTime()),
    );
    const latestB = Math.max(
      ...b.records.map((record) => new Date(record.periodStart).getTime()),
    );
    return latestB - latestA;
  });
}

function parseBulkRows(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sku, price, stock, sales] = line
        .split(",")
        .map((part) => part.trim());
      return {
        sku,
        price: Number(price),
        stock: Number(stock),
        sales: Number(sales),
      };
    })
    .filter(
      (row) =>
        row.sku &&
        Number.isFinite(row.price) &&
        Number.isFinite(row.stock) &&
        Number.isFinite(row.sales),
    );
}

function parseLazadaDate(value: string) {
  const match = value.match(/(\d{4})-([A-Za-z]{3})-(\d{2})\s+(\d{2}:\d{2})/);
  if (!match) return "";
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const month = months[match[2]];
  return month ? `${match[1]}-${month}-${match[3]}T${match[4]}` : "";
}

async function readPdfLines(file: File) {
  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  const document = await getDocument({ data: await file.arrayBuffer() }).promise;
  const lines: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const groups = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const transform = "transform" in item ? item.transform : [1, 0, 0, 1, 0, 0];
      const y = Math.round(Number(transform[5]) / 2) * 2;
      groups.set(y, [...(groups.get(y) ?? []), { x: Number(transform[4]), text: item.str }]);
    }
    [...groups.entries()]
      .sort(([a], [b]) => b - a)
      .forEach(([, items]) => {
        lines.push(items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "));
      });
  }
  return lines;
}

async function parseLazadaPdf(file: File, records: SkuRecord[]): Promise<PdfImportDraft> {
  const lines = await readPdfLines(file);
  const fullText = lines.join("\n");
  if (!fullText.includes("View Store Flash Sale")) {
    throw new Error("Not a Lazada View Store Flash Sale PDF.");
  }

  const periodLine = lines.find((line) => /End Time\s*:/.test(line)) ?? "";
  const startLine =
    lines.find((line) => /^\s*\d{4}-\d{2}-\d{2}\b/.test(line)) ?? "";
  const startMatch = startLine.match(/(\d{4}-\d{2}-\d{2}).*?(\d{2}:\d{2})/);
  const periodStart = startMatch ? `${startMatch[1]}T${startMatch[2]}` : "";
  const periodEnd = parseLazadaDate(periodLine);
  const idIndex = lines.findIndex((line) => /ID:\s*\d+/.test(line));
  const listingId = lines[idIndex]?.match(/ID:\s*(\d+)/)?.[1] ?? "";
  const listingIds = new Set([...fullText.matchAll(/ID:\s*(\d+)/g)].map(match => match[1]));
  if (listingIds.size > 1) throw new Error("Multiple listing IDs detected. Export one listing per PDF to avoid mixing SKU sales.");
  const existingTitle = records.find((record) => record.listingId === listingId)?.listingTitle;
  const firstSkuIndex = lines.findIndex((line) => line.includes("Seller SKU:"));
  const titleParts = idIndex >= 0 && firstSkuIndex > idIndex
    ? lines.slice(idIndex + 1, firstSkuIndex).filter((line) => !/^Seller SKU:/.test(line))
    : [];
  const detectedTitle = titleParts.join(" ").replace(/\s+/g, " ").trim();
  const warnings: string[] = [];
  const rows: PdfImportDraft["rows"] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes("Seller SKU:")) continue;
    const block: string[] = [lines[index]];
    let cursor = index + 1;
    while (cursor < lines.length && !lines[cursor].includes("Seller SKU:")) {
      if (/Lazada 2024|All rights reserved/.test(lines[cursor])) break;
      block.push(lines[cursor]);
      cursor += 1;
    }
    try {
      rows.push(parseVariationBlock(block));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Unreadable variation");
    }
    index = cursor - 1;

  }

  if (!periodStart || !periodEnd || !listingId || !rows.length) {
    throw new Error("Required period, Listing ID, SKU, price, or Item Sold data is missing.");
  }
  return {
    fileName: file.name,
    listingId,
    listingTitle: existingTitle ?? detectedTitle ?? `Lazada listing ${listingId}`,
    periodStart,
    periodEnd,
    rows,
    warnings,
  };
}

export default function LazadaTrackerClient() {
  const [records, setRecords] = useState<SkuRecord[]>([]);
  const [importHistory, setImportHistory] = useState<ImportHistory[]>(
    [],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [screenshotName, setScreenshotName] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [canUpload, setCanUpload] = useState(false);
  const [email, setEmail] = useState("");
  const [cloudError, setCloudError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");
  const [notice, setNotice] = useState(
    "Shared cloud tracker. Old browser data is not imported.",
  );

  const cycles = useMemo(() => buildCycles(records), [records]);
  const recentCycles = useMemo(
    () => [...cycles].sort((a, b) => b.cycle - a.cycle),
    [cycles],
  );
  const listings = useMemo(() => summarize(records, cycles), [records, cycles]);
  const previewRows = useMemo(() => parseBulkRows(form.bulkRows), [form.bulkRows]);

  const totals = useMemo(
    () =>
      records.reduce(
        (sum, record) => ({
          orders: sum.orders + record.sales,
          sales: sum.sales + record.sales * record.price,
          skuRows: sum.skuRows + 1,
        }),
        { orders: 0, sales: 0, skuRows: 0 },
      ),
    [records],
  );

  function updateField(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function refreshCloud() {
    try {
      const response = await fetch("/api/lazada", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRecords(data.records); setImportHistory(data.history);
      setCanUpload(data.canUpload); setEmail(data.email);
      setCloudError(""); setLoaded(true);
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Unable to load shared data.");
    }
  }

  useEffect(() => {
    // Explicit fresh start: never restore old local sales or history.
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(HISTORY_STORAGE_KEY); } catch {}
    const initialRefresh = window.setTimeout(() => void refreshCloud(), 0);
    const timer = setInterval(() => { if (!document.hidden) void refreshCloud(); }, 30000);
    const focus = () => { void refreshCloud(); };
    window.addEventListener("focus", focus);
    return () => {
      clearTimeout(initialRefresh);
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, []);

  useEffect(() => {
    const context = (document as Document & {
      modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => unknown };
    }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(context.registerTool({
        name: "read_lazada_team_summary",
        title: "Read Lazada tracker summary",
        description: "Read current Lazada session, listing, sales-count and sales-value totals without changing data.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input: unknown) {
          if (!input || typeof input !== "object" || Object.keys(input).length) throw new Error("Expected an empty object.");
          return { sessions: records.length, listings: listings.length, ...totals };
        },
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Optional browser capability. */ }
    return () => lifecycle.abort();
  }, [listings.length, records.length, totals]);

  async function submitCloud(draft: unknown, file?: File | null, error?: string) {
    const body = new FormData();
    if (file) body.set("file", file);
    if (draft) body.set("draft", JSON.stringify(draft));
    if (error) body.set("error", error);
    const response = await fetch("/api/lazada", { method: "POST", body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed");
    return data.status as string;
  }

  async function saveRecords(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpload || pdfBusy) return;
    setPdfBusy(true);
    try {
      const status = await submitCloud({ ...form, rows: previewRows }, screenshotFile);
      setNotice("Cloud import: " + status);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Save failed"); }
    finally { await refreshCloud(); setPdfBusy(false); }
  }

  async function importPdfFiles() {
    if (!pdfFiles.length || pdfBusy || !canUpload) return;
    setPdfBusy(true);
    const results: string[] = [];
    for (const [index, file] of pdfFiles.entries()) {
      setPdfStatus(`Processing ${index + 1} of ${pdfFiles.length}: ${file.name}`);
      let draft: PdfImportDraft;
      try {
        if (file.size > 15 * 1024 * 1024) throw new Error("Maximum file size is 15 MB.");
        draft = await parseLazadaPdf(file, records);
        if (draft.warnings.length) throw new Error(draft.warnings.join(" "));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unreadable PDF";
        try { await submitCloud(null, file, message); }
        catch (savedError) {
          const detail = savedError instanceof Error ? savedError.message : "";
          results.push(file.name + ": failed — " + message + (detail !== message ? " (Could not confirm cloud error log: " + detail + ")" : ""));
        }
        continue;
      }
      try { results.push(file.name + ": " + await submitCloud(draft, file)); }
      catch (error) { results.push(file.name + ": " + (error instanceof Error ? error.message : "Upload failed")); }
    }
    await refreshCloud();
    setPdfStatus(results.join(" · "));
    setPdfFiles([]);
    const input = document.getElementById("lazada-pdfs") as HTMLInputElement | null;
    if (input) input.value = "";
    setPdfBusy(false);
  }

  function toggle(listingId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(listingId)) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
  }

  return (
    <main className="lazada-module page-shell">
      <PlatformNav active="lazada" />
      <div className="notice" role="status">
        {cloudError || (loaded ? "Shared cloud data · refreshed every 30 seconds" : "Loading shared data…")}
        <button className="ghost-button" onClick={refreshCloud}>Refresh</button>
        {email ? <span> Signed in: {email} {!canUpload && "· View only"}</span> : <a href="/signin-with-chatgpt?return_to=%2Flazada" target="_top"> Sign in to upload</a>}
      </div>
      <section className="hero">
        <div>
          <p className="eyebrow">CHANDO LAZADA · SEPARATE TRACKER</p>
          <h1>PDF-powered flash sale cycle tracker</h1>
          <p className="hero-text">
            Upload Lazada Store Flash Sale PDFs and turn them into clean variation sales,
            continuous 3-day cycles, and an auditable import history.
          </p>
        </div>
        <div className="hero-card">
          <span>Total variation session rows</span>
          <strong>{integer(totals.skuRows)}</strong>
          <span>
            {integer(totals.orders)} sales count · {money(totals.sales)}
          </span>
        </div>
      </section>

      <section className="capture-panel">
        <div className="panel-copy">
          <p className="eyebrow">PDF UPDATE</p>
          <h2>Drop in your Lazada reports</h2>
          <p>
            Select one or many Store Flash Sale PDFs. The tracker reads the period,
            Listing ID, variation name, Store Flash Price and Item Sold automatically.
          </p>
          <div className="import-steps">
            <span><b>01</b>Select PDFs</span>
            <span><b>02</b>Check file count</span>
            <span><b>03</b>Import together</span>
          </div>
        </div>

        <form className="capture-form" onSubmit={saveRecords}>
          <fieldset disabled={!canUpload || pdfBusy} style={{border: 0, padding: 0, margin: 0, minWidth: 0}}>
          {!canUpload && <p>Only authorized CHANDO members can import. Sign in using your approved email.</p>}
          <div className="pdf-import-box">
            <div className="pdf-import-heading">
              <span className="pdf-badge">PDF</span>
              <div>
                <strong>Bulk import Lazada PDFs</strong>
                <span>One PDF or a whole batch</span>
              </div>
            </div>
            <label className="pdf-file-picker" htmlFor="lazada-pdfs">
              <strong>{pdfFiles.length ? `${pdfFiles.length} PDF${pdfFiles.length > 1 ? "s" : ""} selected` : "Choose PDF files"}</strong>
              <span>
                {pdfFiles.length
                  ? pdfFiles.slice(0, 3).map((file) => file.name).join(" · ")
                  : "PDF only · multiple selection supported"}
              </span>
            </label>
            <input
              id="lazada-pdfs"
              className="pdf-input"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={(event) => setPdfFiles(Array.from(event.target.files ?? []))}
            />
            <button
              type="button"
              onClick={importPdfFiles}
              disabled={!pdfFiles.length || pdfBusy}
            >
              {pdfBusy
                ? "Reading PDFs…"
                : pdfFiles.length > 1
                  ? `Import ${pdfFiles.length} PDFs`
                  : "Import PDF"}
            </button>
            {pdfStatus && <p className="pdf-status">{pdfStatus}</p>}
          </div>

          <details className="manual-entry">
            <summary>
              <span>Manual entry</span>
              <small>Optional fallback for screenshots</small>
            </summary>
            <div className="manual-entry-body">
              <div className="field-grid">
            <label>
              Listing ID
              <input
                name="listingId"
                value={form.listingId}
                onChange={updateField}
              />
            </label>
            <label>
              Listing name
              <input
                name="listingTitle"
                value={form.listingTitle}
                onChange={updateField}
              />
            </label>
            <label>
              Period start
              <input
                type="datetime-local"
                name="periodStart"
                value={form.periodStart}
                onChange={updateField}
              />
            </label>
            <label>
              Period end
              <input
                type="datetime-local"
                name="periodEnd"
                value={form.periodEnd}
                onChange={updateField}
              />
            </label>
              </div>
              <label>
            Screenshot reference
            <input
              type="file"
              accept="image/*"
              onChange={(event) =>
                { setScreenshotName(event.target.files?.[0]?.name ?? ""); setScreenshotFile(event.target.files?.[0] ?? null); }
              }
            />
            {screenshotName && <span className="file-note">{screenshotName}</span>}
              </label>
              <label>
            Checked variation rows
            <textarea
              name="bulkRows"
              value={form.bulkRows}
              onChange={updateField}
              rows={6}
            />
              </label>
              <label>
            Source note
            <input
              name="sourceNote"
              value={form.sourceNote}
              onChange={updateField}
            />
              </label>

              <div className="preview-box">
            <strong>Preview before save</strong>
            <div className="preview-table">
              {previewRows.map((row) => (
                <span key={row.sku}>
                  {row.sku} · {money(row.price)} · stock {integer(row.stock)} ·
                  sales {integer(row.sales)}
                </span>
              ))}
            </div>
              </div>

              <div className="form-actions">
            <button type="submit">Save screenshot period</button>

              </div>
              <p className="notice">{notice}</p>
            </div>
          </details>
          </fieldset>
        </form>
      </section>

      <section className="tracker-panel">
        {loaded && !records.length && <p className="notice">No sales imported yet. Upload Lazada PDFs to start the shared tracker.</p>}
        <div className="tracker-heading">
          <div>
            <p className="eyebrow">PRODUCT PERSPECTIVE</p>
            <h2>Recent Lazada cycles first</h2>
            <p>
              Products stay collapsed by default. Expand a listing only when you
              want to check the variation contribution.
            </p>
          </div>
          <button className="ghost-button" onClick={() => setExpanded(new Set())}>
            Collapse all
          </button>
        </div>

        <div className="cycle-strip">
          {recentCycles.map((cycle) => {
            const cycleTotals = listings.reduce(
              (sum, listing) => {
                const metric = listing.cycles[cycle.cycle - 1];
                return {
                  orders: sum.orders + metric.orders,
                  sales: sum.sales + metric.sales,
                };
              },
              { orders: 0, sales: 0 },
            );
            return (
              <div className="cycle-card" key={cycle.cycle}>
                <span>Cycle {cycle.cycle}</span>
                <strong>{integer(cycleTotals.orders)}</strong>
                <small>{cycle.dates.map(formatDate).join(", ")}</small>
                <small>{money(cycleTotals.sales)}</small>
              </div>
            );
          })}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="product-col">Listing / variation</th>
                {recentCycles.map((cycle) => (
                  <th key={cycle.cycle}>
                    Cycle {cycle.cycle}
                    <span>{cycle.dates.map(formatDate).join(", ")}</span>
                  </th>
                ))}
                <th>Total</th>
                <th>Sales</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => {
                const isOpen = expanded.has(listing.listingId);
                const skuSummaries = [...listing.records.reduce(
                  (map, record) => {
                    map.set(record.sku, [
                      ...(map.get(record.sku) ?? []),
                      record,
                    ]);
                    return map;
                  },
                  new Map<string, SkuRecord[]>(),
                ).entries()].map(([sku, skuRecords]) => ({ sku, records: skuRecords }));
                const totalOrders = listing.cycles.reduce(
                  (sum, metric) => sum + metric.orders,
                  0,
                );
                const totalSales = listing.cycles.reduce(
                  (sum, metric) => sum + metric.sales,
                  0,
                );
                return (
                  <Fragment key={listing.listingId}>
                    <tr className="listing-row">
                      <td className="product-col">
                        <button
                          className="expand-button"
                          onClick={() => toggle(listing.listingId)}
                          aria-label={`${isOpen ? "Collapse" : "Expand"} ${
                            listing.listingTitle
                          }`}
                        >
                          <span className={isOpen ? "open" : ""}>›</span>
                        </button>
                        <div>
                          <span className="id-label">ID {listing.listingId}</span>
                          <strong>{listing.listingTitle}</strong>
                          <span className="sku-count">
                            {skuSummaries.length} SKUs
                          </span>
                          <span className="source-chip">
                            Latest: {formatDateTime(listing.records[0].periodStart)}
                          </span>
                        </div>
                      </td>
                      {recentCycles.map((cycle) => {
                        const metric = listing.cycles[cycle.cycle - 1];
                        return (
                          <td key={cycle.cycle} className="metric-cell">
                            <strong>{integer(metric.orders)}</strong>
                            <span>{money(metric.sales)}</span>
                          </td>
                        );
                      })}
                      <td className="metric-cell strong">
                        <strong>{integer(totalOrders)}</strong>
                      </td>
                      <td className="metric-cell strong">
                        <strong>{money(totalSales)}</strong>
                      </td>
                    </tr>
                    {isOpen &&
                      skuSummaries.map((skuSummary) => {
                        const latestRecord = [...skuSummary.records].sort(
                          (a, b) =>
                            new Date(b.periodStart).getTime() -
                            new Date(a.periodStart).getTime(),
                        )[0];
                        const skuTotalOrders = skuSummary.records.reduce(
                          (sum, record) => sum + record.sales,
                          0,
                        );
                        const skuTotalSales = skuSummary.records.reduce(
                          (sum, record) => sum + record.sales * record.price,
                          0,
                        );
                        return (
                        <tr className="sku-row" key={skuSummary.sku}>
                          <td className="product-col sku-product">
                            <span className="branch">↳</span>
                            <div>
                              <strong>{skuSummary.sku}</strong>
                              <span>
                                {skuSummary.records.length} imported period
                                {skuSummary.records.length > 1 ? "s" : ""} · latest {" "}
                                {formatDateTime(latestRecord.periodStart)}
                              </span>
                            </div>
                          </td>
                          {recentCycles.map((cycle) => {
                            const cycleRecords = skuSummary.records.filter(
                              (record) =>
                                cycleForDate(record.periodStart) === cycle.cycle,
                            );
                            const cycleOrders = cycleRecords.reduce(
                              (sum, record) => sum + record.sales,
                              0,
                            );
                            const cycleSales = cycleRecords.reduce(
                              (sum, record) => sum + record.sales * record.price,
                              0,
                            );
                            return (
                              <td key={cycle.cycle} className="metric-cell muted">
                                <strong>{integer(cycleOrders)}</strong>
                                <span>
                                  {cycleRecords.length ? money(cycleSales) : "—"}
                                </span>
                              </td>
                            );
                          })}
                          <td className="metric-cell">
                            <strong>{integer(skuTotalOrders)}</strong>
                            <span>latest stock {integer(latestRecord.stock)}</span>
                          </td>
                          <td className="metric-cell">
                            <strong>{money(skuTotalSales)}</strong>
                          </td>
                        </tr>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="history-panel">
        <div className="history-heading">
          <div>
            <p className="eyebrow">IMPORT HISTORY</p>
            <h2>Recent PDF imports</h2>
          </div>
          <p>Latest 5 imports stay visible. Older entries remain available.</p>
        </div>
        <div className="history-list">
          {!canUpload && <p>Sign in as an authorized member to view team import history.</p>}
          {canUpload && !importHistory.length && <p>No imports yet.</p>}
          {(showAllHistory ? importHistory : importHistory.slice(0, 5)).map(
            (entry) => (
              <article key={entry.id}>
                <span className={entry.replaced ? "history-status replaced" : "history-status added"}>
                  {entry.status || (entry.replaced ? "Replaced" : "Added")}
                </span>
                <div className="history-main">
                  <strong>{entry.sourceFile}</strong>
                  <span>
                    ID {entry.listingId} · {entry.listingTitle}
                  </span>
                  <small>
                    {entry.periodStart ? formatDateTime(entry.periodStart) : ""} {entry.periodEnd ? "– " + formatDateTime(entry.periodEnd) : ""}
                    {entry.error}
                  </small>
                </div>
                <div className="history-metrics">
                  <strong>{entry.salesCount} sales · {money(entry.salesValue)}</strong>
                  <span>{entry.skuRows} variation rows · Revision {entry.revision}</span>
                  <small>{formatDateTime(entry.importedAt)} · {entry.uploadedBy}</small>
                </div>
              </article>
            ),
          )}
        </div>
        {importHistory.length > 5 && (
          <button
            className="ghost-button history-toggle"
            type="button"
            onClick={() => setShowAllHistory((current) => !current)}
          >
            {showAllHistory
              ? "Collapse older imports"
              : `Show older imports (${importHistory.length - 5})`}
          </button>
        )}
      </section>
    </main>
  );
}
