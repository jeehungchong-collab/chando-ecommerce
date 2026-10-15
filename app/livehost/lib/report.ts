import { env } from "cloudflare:workers";
import * as XLSX from "xlsx";
import julySource from "./july-2026-source.json";
import septemberReport from "./september-2026-report.json";
import { groupSessionsByMonth } from "./months";

export type HostReport = {
  name: string;
  gmv: number;
  hours: number;
  gmvHour: number;
  orders: number;
  views: number;
  viewerCvr: number;
  atcOrder: number;
  costRoi: number;
  peakShare: number;
  campaign: number;
  late: number;
  night: number;
  noon: number;
  offPeak: number;
  read: string;
};

export type TimingReport = {
  label: string;
  window: string;
  sessions: number;
  hours: number;
  gmv: number;
  gmvHour: number;
  viewerCvr: number;
  views: number;
  orders: number;
};

export type UploadSummary = {
  fileNames: string[];
  rowCount: number;
  dateRange: string;
  detectedHosts: string[];
  unclearRows: number;
  totalGmv: number;
  totalOrders: number;
  totalViews: number;
};

export type LivehostReport = {
  title: string;
  subtitle: string;
  generatedAt: string | null;
  uploadedByEmail: string | null;
  sourceFiles: string[];
  summary: UploadSummary;
  hosts: HostReport[];
  timing: TimingReport[];
  recommendations: [string, string, string][];
  unclearRows: ParsedSession[];
  sessions?: ParsedSession[];
};

export type ParsedSession = {
  key: string;
  fileName: string;
  rowNumber: number;
  date: string;
  livestreamName: string;
  startTime: string;
  duration: string;
  host: string;
  timing: string;
  hours: number;
  gmv: number;
  orders: number;
  views: number;
  atc: number;
  items: number;
  peakHours: number;
};

export type UploadHistoryItem = {
  id: string;
  uploadedAt: string;
  uploadedByEmail: string;
  fileNames: string[];
  rowCount: number;
  dateRange: string;
  totalGmv: number;
  totalOrders: number;
  totalViews: number;
  unclearRows: number;
};

export type ReportArchiveItem = {
  month?: string;
  id: string;
  label: string;
  uploadedAt: string | null;
  uploadedByEmail: string | null;
  report: LivehostReport;
};

type MetricBucket = {
  sessions: number;
  hours: number;
  gmv: number;
  orders: number;
  views: number;
  atc: number;
  items: number;
  peakHours: number;
};

type SourceFile = {
  name: string;
  type: string;
  bytes: ArrayBuffer;
};

export type DateRangeFilter = {
  startDate?: string;
  endDate?: string;
};

const requiredColumns: [string, string[]][] = [
  ["Livestream Name", ["Livestream Name"]],
  ["Start Time", ["Start Time"]],
  ["Duration", ["Duration", "Duration:"]],
  ["Viewers", ["Viewers"]],
  ["ATC", ["ATC"]],
  ["Orders(Confirmed Order)", ["Orders(Confirmed Order)"]],
  ["Items Sold(Confirmed Order)", ["Items Sold(Confirmed Order)"]],
  ["Sales(Confirmed Order)", ["Sales(Confirmed Order)"]],
];

const hostAliases: Record<string, string> = {
  IEFAA: "Iefaa",
  IEFA: "Iefaa",
  BIBI: "Bibi",
  BEBY: "Bibi",
  BEBEY: "Bibi",
  AMY: "Amy",
  AMY6: "Amy",
  ROSHA: "Rosha",
  ZATI: "Zati",
  HANA: "Hana",
  HANNAH: "Hannah",
  INTAN: "Intan",
  FISH: "Fish",
};

const salaryByHost: Record<string, number> = {
  Amy: 2171.72,
  Bibi: 1280.19,
  Fish: 1169.23,
  Hana: 2287.5,
  Iefaa: 3258.98,
  Intan: 2135.81,
  Rosha: 1471.13,
  Zati: 1611.33,
};

const campaignDays = new Set([7, 15, 25]);

const timingOrder: [string, string, string][] = [
  ["Campaign peak date", "Campaign dates", "7/7, 15/7, 25/7"],
  ["Late night peak start", "Late night peak", "10pm-12am"],
  ["Night peak start", "Night peak", "8-10pm"],
  ["Noon peak start", "Noon peak", "12-2pm"],
  ["Off-peak start", "Off-peak", "Other slots"],
];

const staticHosts: HostReport[] = [
  {
    name: "Hana",
    gmv: 19071.1,
    hours: 57.19,
    gmvHour: 333,
    orders: 258,
    views: 12434,
    viewerCvr: 2.07,
    atcOrder: 18.32,
    costRoi: 8.34,
    peakShare: 57.2,
    campaign: 490,
    late: 677,
    night: 194,
    noon: 233,
    offPeak: 186,
    read: "Strongest overall GMV/hour. Best slot is 10pm-12am; campaign dates are also strong.",
  },
  {
    name: "Fish",
    gmv: 11110.54,
    hours: 37.14,
    gmvHour: 299,
    orders: 161,
    views: 9879,
    viewerCvr: 1.63,
    atcOrder: 18.05,
    costRoi: 9.5,
    peakShare: 40.7,
    campaign: 0,
    late: 0,
    night: 756,
    noon: 277,
    offPeak: 252,
    read: "Best cost efficiency. No campaign or late-night sample, but 8-10pm result is excellent.",
  },
  {
    name: "Amy",
    gmv: 17888.71,
    hours: 62.05,
    gmvHour: 288,
    orders: 243,
    views: 12968,
    viewerCvr: 1.87,
    atcOrder: 19.1,
    costRoi: 8.24,
    peakShare: 75.5,
    campaign: 394,
    late: 391,
    night: 314,
    noon: 224,
    offPeak: 119,
    read: "Timing helped a lot, but she used good slots well across campaign, late night, and 8-10pm.",
  },
  {
    name: "Bibi",
    gmv: 9251.23,
    hours: 36.58,
    gmvHour: 253,
    orders: 126,
    views: 8341,
    viewerCvr: 1.51,
    atcOrder: 17.33,
    costRoi: 7.23,
    peakShare: 58.7,
    campaign: 444,
    late: 290,
    night: 0,
    noon: 204,
    offPeak: 201,
    read: "Campaign dates are her best signal. Noon is not meaningfully better than off-peak.",
  },
  {
    name: "Intan",
    gmv: 16780.62,
    hours: 72.61,
    gmvHour: 231,
    orders: 236,
    views: 15887,
    viewerCvr: 1.49,
    atcOrder: 18.2,
    costRoi: 7.86,
    peakShare: 42.4,
    campaign: 430,
    late: 228,
    night: 49,
    noon: 224,
    offPeak: 182,
    read: "Campaign dates lift her strongly. Noon and 10pm-12am are useful; 8-10pm sample was weak.",
  },
  {
    name: "Rosha",
    gmv: 8173.51,
    hours: 36.78,
    gmvHour: 222,
    orders: 112,
    views: 8574,
    viewerCvr: 1.31,
    atcOrder: 20.9,
    costRoi: 5.56,
    peakShare: 46.1,
    campaign: 534,
    late: 213,
    night: 321,
    noon: 0,
    offPeak: 176,
    read: "Very good campaign-date signal and best ATC-to-order rate. Worth controlled tests on promo days.",
  },
  {
    name: "Zati",
    gmv: 8871.82,
    hours: 40.28,
    gmvHour: 220,
    orders: 123,
    views: 8248,
    viewerCvr: 1.49,
    atcOrder: 19.22,
    costRoi: 5.51,
    peakShare: 9.7,
    campaign: 0,
    late: 0,
    night: 263,
    noon: 0,
    offPeak: 215,
    read: "Still very low expanded-peak exposure. Schedule may be limiting her total; test promo dates or late night.",
  },
  {
    name: "Iefaa",
    gmv: 17092.56,
    hours: 93.11,
    gmvHour: 184,
    orders: 247,
    views: 20058,
    viewerCvr: 1.23,
    atcOrder: 15.03,
    costRoi: 5.24,
    peakShare: 42.0,
    campaign: 377,
    late: 202,
    night: 200,
    noon: 195,
    offPeak: 116,
    read: "Peak timing helps, especially campaign dates, but conversion and GMV/hour remain below the stronger hosts.",
  },
];

const staticTiming: TimingReport[] = [
  { label: "Campaign dates", window: "7/7, 15/7, 25/7", sessions: 23, hours: 51.04, gmv: 21895.98, gmvHour: 429, viewerCvr: 2.62, views: 10958, orders: 287 },
  { label: "Late night peak", window: "10pm-12am", sessions: 25, hours: 50.77, gmv: 18581.63, gmvHour: 366, viewerCvr: 1.74, views: 14613, orders: 254 },
  { label: "Night peak", window: "8-10pm", sessions: 32, hours: 54.32, gmv: 15415.08, gmvHour: 284, viewerCvr: 1.93, views: 11731, orders: 226 },
  { label: "Noon peak", window: "12-2pm", sessions: 26, hours: 58.06, gmv: 12856.92, gmvHour: 221, viewerCvr: 1.44, views: 11785, orders: 170 },
  { label: "Off-peak", window: "Other slots", sessions: 109, hours: 221.56, gmv: 39490.48, gmvHour: 178, viewerCvr: 1.2, views: 47302, orders: 569 },
];

export const fallbackReport: LivehostReport = {
  title: "July 2026 Livehost Performance",
  subtitle:
    "Performance-only dashboard for host output, expanded peak timing impact, and next-month scheduling. Private payroll identity fields are excluded.",
  generatedAt: null,
  uploadedByEmail: null,
  sourceFiles: [
    "export-sc_confirmed_1m_2026-07-31_1157517_1785594758186.csv",
    "export-sc_confirmed_1m_2026-07-31_0044490_1785594754452.csv",
    "export-sc_confirmed_1m_2026-07-31_6426716_1785594747760.csv",
  ],
  summary: {
    fileNames: [],
    rowCount: 215,
    dateRange: "July 2026",
    detectedHosts: ["Amy", "Bibi", "Fish", "Hana", "Iefaa", "Intan", "Rosha", "Zati"],
    unclearRows: 0,
    totalGmv: 108240.09,
    totalOrders: 1506,
    totalViews: 96389,
  },
  hosts: staticHosts,
  timing: staticTiming,
  recommendations: makeRecommendations(staticHosts),
  unclearRows: [],
  sessions: [],
};

export function getUploaderEmails() {
  const raw = String((env as unknown as { UPLOADER_EMAILS?: string }).UPLOADER_EMAILS ?? "");
  const emails = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return emails.length ? emails : ["jeehung.chong@chando.my"];
}

export function isUploader(email: string | null | undefined) {
  if (!email) return false;
  return getUploaderEmails().includes(email.trim().toLowerCase());
}

export async function parseFiles(files: SourceFile[], dateRange: DateRangeFilter = {}): Promise<LivehostReport> {
  if (!files.length) {
    throw new Error("Upload at least one Shopee livestream export file.");
  }

  const range = normalizeDateRange(dateRange);
  const sessions: ParsedSession[] = [];
  for (const file of files) {
    const rows = await readRows(file);
    validateRows(file.name, rows);
    rows.forEach((row, index) => sessions.push(parseSession(row, file.name, index + 2)));
  }

  const unique = dedupeSessions(sessions);
  const filtered = unique.filter((session) => inDateRange(session.date, range));
  if (!filtered.length) {
    throw new Error("No livestream rows found inside the selected date range.");
  }
  const report = buildReport(filtered, files.map((file) => file.name), range);
  return report;
}

export async function readUploadedFiles(formData: FormData): Promise<SourceFile[]> {
  const entries = formData.getAll("files");
  const files: SourceFile[] = [];
  for (const entry of entries) {
    if (!(entry instanceof File)) continue;
    if (!entry.name) continue;
    const size = entry.size;
    if (size > 8 * 1024 * 1024) {
      throw new Error(`${entry.name} is too large. Keep each file below 8MB.`);
    }
    files.push({
      name: entry.name,
      type: entry.type || guessContentType(entry.name),
      bytes: await entry.arrayBuffer(),
    });
  }
  return files;
}

export async function loadStoredReport(): Promise<LivehostReport> {
  try {
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return fallbackReport;
    const row = await db
      .prepare("SELECT id, report_json FROM report_uploads ORDER BY created_at DESC LIMIT 1")
      .first<{ id: string; report_json: string }>();
    if (!row?.report_json) return fallbackReport;
    const report = JSON.parse(row.report_json) as LivehostReport;
    if (report.sessions?.length) return report;
    return restoreReportSessions(row.id, report);
  } catch {
    return fallbackReport;
  }
}

async function restoreReportSessions(reportId: string, report: LivehostReport): Promise<LivehostReport> {
  try {
    const db = (env as unknown as { DB?: D1Database }).DB;
    const uploads = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
    if (!db || !uploads) return report;
    const { results } = await db
      .prepare(
        `SELECT file_name, content_type, r2_key
         FROM uploaded_files
         WHERE report_id = ?
         ORDER BY created_at ASC`,
      )
      .bind(reportId)
      .all<{ file_name: string; content_type: string; r2_key: string }>();
    const files: SourceFile[] = [];
    for (const row of results ?? []) {
      const object = await uploads.get(row.r2_key);
      if (!object) continue;
      files.push({
        name: row.file_name,
        type: row.content_type,
        bytes: await object.arrayBuffer(),
      });
    }
    if (!files.length) return report;
    const rebuilt = await parseFiles(files);
    return {
      ...rebuilt,
      generatedAt: report.generatedAt,
      uploadedByEmail: report.uploadedByEmail,
    };
  } catch {
    return report;
  }
}

export async function loadUploadHistory(): Promise<UploadHistoryItem[]> {
  try {
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return [];
    const { results } = await db
      .prepare(
        `SELECT id, created_at, uploaded_by_email, file_names_json, row_count, date_range,
          total_gmv, total_orders, total_views, unclear_rows
         FROM report_uploads
         ORDER BY created_at DESC
         LIMIT 20`,
      )
      .all<{
        id: string;
        created_at: string;
        uploaded_by_email: string;
        file_names_json: string;
        row_count: number;
        date_range: string;
        total_gmv: number;
        total_orders: number;
        total_views: number;
        unclear_rows: number;
      }>();

    return (results ?? []).map((row) => ({
      id: row.id,
      uploadedAt: row.created_at,
      uploadedByEmail: row.uploaded_by_email,
      fileNames: parseFileNames(row.file_names_json),
      rowCount: row.row_count,
      dateRange: row.date_range,
      totalGmv: row.total_gmv,
      totalOrders: row.total_orders,
      totalViews: row.total_views,
      unclearRows: row.unclear_rows,
    }));
  } catch {
    return [];
  }
}

export async function loadReportArchive(): Promise<ReportArchiveItem[]> {
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return [septemberArchiveItem(), julyArchiveItem()];
    const byMonth = new Map<string, ReportArchiveItem>();
    // Read every upload page so a month never disappears after 20 later uploads.
    for (let offset = 0; ; offset += 20) {
    const { results } = await db
      .prepare(
        `SELECT id, created_at, uploaded_by_email, report_json
         FROM report_uploads
         ORDER BY created_at DESC, id DESC
         LIMIT 20 OFFSET ?`,
      )
      .bind(offset)
      .all<{
        id: string;
        created_at: string;
        uploaded_by_email: string;
        report_json: string;
      }>();

    for (const row of results ?? []) {
      const parsed = JSON.parse(row.report_json) as LivehostReport;
      const report = parsed.sessions?.length ? parsed : await restoreReportSessions(row.id, parsed);
      for (const [month, sessions] of groupSessionsByMonth(report.sessions ?? [])) {
        if (byMonth.has(month)) continue;
        const monthly = { ...buildReport(sessions, report.sourceFiles),
          generatedAt: report.generatedAt, uploadedByEmail: report.uploadedByEmail };
        byMonth.set(month, { id: row.id + ":" + month, month,
          label: `${monthly.title} - ${monthly.summary.dateRange}`,
          uploadedAt: row.created_at, uploadedByEmail: row.uploaded_by_email, report: monthly });
      }
    }
    if ((results ?? []).length < 20) break;
  }
    if (!byMonth.has("2026-09")) byMonth.set("2026-09", septemberArchiveItem());
    if (!byMonth.has("2026-07")) byMonth.set("2026-07", julyArchiveItem());
    return [...byMonth.values()].sort((a, b) => b.month!.localeCompare(a.month!));
}

export function julyArchiveItem(): ReportArchiveItem {
  return {
    id: "baseline-july-2026",
    month: "2026-07",
    label: "July 2026 Livehost Performance - 215 sessions",
    uploadedAt: null,
    uploadedByEmail: null,
    report: buildReport(
      dedupeSessions(julySource.map((entry) => parseSession(entry.row, entry.fileName, entry.rowNumber))),
      [...new Set(julySource.map((entry) => entry.fileName))],
    ),
  };
}

const baselineArchiveItem = julyArchiveItem;

export function septemberArchiveItem(): ReportArchiveItem {
  return {
    id: "migrated-september-2026",
    month: "2026-09",
    label: "September 2026 Livehost Performance - 186 sessions",
    uploadedAt: "2026-10-02T16:48:17.627Z",
    uploadedByEmail: "jeehung.chong@chando.my",
    report: septemberReport as LivehostReport,
  };
}

export async function saveReport(report: LivehostReport, files: SourceFile[], uploadedByEmail: string) {
  const db = (env as unknown as { DB?: D1Database }).DB;
  const uploads = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
  if (!db || !uploads) {
    throw new Error("Upload storage is not ready yet. D1 and R2 bindings are required.");
  }

  const reportId = crypto.randomUUID();
  const now = new Date().toISOString();
  const reportWithMeta: LivehostReport = {
    ...report,
    generatedAt: now,
    uploadedByEmail,
  };

  const fileRows = [];
  const months = [...groupSessionsByMonth(report.sessions ?? []).keys()].sort();
  const folder = months.length === 1 ? months[0] : "multi-month";
  for (const file of files) {
    const fileId = crypto.randomUUID();
    const r2Key = `raw-archive/${folder}/${reportId}/${fileId}-${safeFileName(file.name)}`;
    const digest = await crypto.subtle.digest("SHA-256", file.bytes);
    const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    await uploads.put(r2Key, file.bytes, {
      httpMetadata: { contentType: file.type || guessContentType(file.name) },
      customMetadata: { sha256, uploadedAt: now, months: months.join(",") },
    });
    fileRows.push({
      id: fileId,
      r2Key,
      fileName: file.name,
      contentType: file.type || guessContentType(file.name),
      sizeBytes: file.bytes.byteLength,
    });
  }

  const reportInsert = db
    .prepare(
      `INSERT INTO report_uploads
        (id, created_at, uploaded_by_email, file_names_json, file_count, row_count, date_range,
         total_gmv, total_orders, total_views, unclear_rows, report_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      reportId,
      now,
      uploadedByEmail,
      JSON.stringify(report.sourceFiles),
      report.sourceFiles.length,
      report.summary.rowCount,
      report.summary.dateRange,
      report.summary.totalGmv,
      report.summary.totalOrders,
      report.summary.totalViews,
      report.summary.unclearRows,
      JSON.stringify(reportWithMeta),
    );

  await db.batch(
    [reportInsert, ...fileRows.map((file) =>
      db
        .prepare(
          `INSERT INTO uploaded_files
            (id, report_id, created_at, file_name, content_type, size_bytes, r2_key)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(file.id, reportId, now, file.fileName, file.contentType, file.sizeBytes, file.r2Key),
    )],
  );

  return reportWithMeta;
}

async function readRows(file: SourceFile) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) {
    return parseCsv(decodeCsv(file.bytes));
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const workbook = XLSX.read(file.bytes, { type: "array", cellDates: false });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error(`${file.name} has no worksheet.`);
    const sheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  }
  throw new Error(`${file.name} is not supported. Upload CSV or XLSX Shopee exports.`);
}

function validateRows(fileName: string, rows: Record<string, unknown>[]) {
  if (!rows.length) throw new Error(`${fileName} has no data rows.`);
  const columns = new Set(Object.keys(rows[0]));
  const missing = requiredColumns
    .filter(([, aliases]) => !aliases.some((column) => columns.has(column)))
    .map(([label]) => label);
  if (missing.length) {
    throw new Error(`${fileName} is missing required columns: ${missing.join(", ")}`);
  }
}

function parseSession(row: Record<string, unknown>, fileName: string, rowNumber: number): ParsedSession {
  const livestreamName = String(field(row, "Livestream Name") ?? "");
  const startTime = String(field(row, "Start Time") ?? "");
  const duration = String(field(row, "Duration") ?? "");
  const start = parseStart(startTime);
  const hours = durationHours(duration);
  const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const timing = timingSlot(start);

  return {
    key: stableKey(fileName, rowNumber, startTime, livestreamName, duration),
    fileName,
    rowNumber,
    date,
    livestreamName,
    startTime,
    duration,
    host: hostFromTitle(livestreamName),
    timing,
    hours,
    gmv: asNumber(field(row, "Sales(Confirmed Order)")),
    orders: asNumber(field(row, "Orders(Confirmed Order)")),
    views: asNumber(field(row, "Viewers")),
    atc: asNumber(field(row, "ATC")),
    items: asNumber(field(row, "Items Sold(Confirmed Order)")),
    peakHours: peakHours(start, hours),
  };
}

function field(row: Record<string, unknown>, label: string) {
  const aliases = requiredColumns.find(([requiredLabel]) => requiredLabel === label)?.[1] ?? [label];
  for (const alias of aliases) {
    if (alias in row) return row[alias];
  }
  return undefined;
}

function dedupeSessions(sessions: ParsedSession[]) {
  const seen = new Set<string>();
  const unique: ParsedSession[] = [];
  for (const session of sessions) {
    const key = `${session.startTime}|${session.livestreamName}|${session.duration}|${session.gmv}|${session.orders}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(session);
  }
  return unique;
}

function buildReport(sessions: ParsedSession[], fileNames: string[], requestedRange?: Required<DateRangeFilter>): LivehostReport {
  const hostTotals = new Map<string, MetricBucket>();
  const hostTiming = new Map<string, Map<string, MetricBucket>>();
  const timingTotals = new Map<string, MetricBucket>();

  for (const session of sessions) {
    if (!hostTotals.has(session.host)) hostTotals.set(session.host, blankMetrics());
    if (!hostTiming.has(session.host)) hostTiming.set(session.host, new Map());
    if (!hostTiming.get(session.host)?.has(session.timing)) {
      hostTiming.get(session.host)?.set(session.timing, blankMetrics());
    }
    if (!timingTotals.has(session.timing)) timingTotals.set(session.timing, blankMetrics());

    addSession(hostTotals.get(session.host), session);
    addSession(hostTiming.get(session.host)?.get(session.timing), session);
    addSession(timingTotals.get(session.timing), session);
  }

  const hosts = [...hostTotals.keys()]
    .filter((host) => host !== "Unclear")
    .map((host) => makeHostReport(host, hostTotals.get(host), hostTiming.get(host)))
    .sort((a, b) => b.gmvHour - a.gmvHour);

  const timing = timingOrder.map(([slot, label, window]) => {
    const data = timingTotals.get(slot) ?? blankMetrics();
    return {
      label,
      window,
      sessions: data.sessions,
      hours: round2(data.hours),
      gmv: round2(data.gmv),
      gmvHour: round0(ratio(data.gmv, data.hours)),
      viewerCvr: round2(ratio(data.orders, data.views) * 100),
      views: round0(data.views),
      orders: round0(data.orders),
    };
  });

  const dates = sessions.map((session) => session.date).sort();
  const totalGmv = sessions.reduce((sum, session) => sum + session.gmv, 0);
  const totalOrders = sessions.reduce((sum, session) => sum + session.orders, 0);
  const totalViews = sessions.reduce((sum, session) => sum + session.views, 0);
  const unclearRows = sessions.filter((session) => session.host === "Unclear");

  return {
    title: dates.length ? `${formatMonthTitle(dates[0])} Livehost Performance` : "Livehost Performance",
    subtitle:
      "Performance-only dashboard for uploaded Shopee livestream exports. Private payroll identity fields are excluded.",
    generatedAt: null,
    uploadedByEmail: null,
    sourceFiles: fileNames,
    summary: {
      fileNames,
      rowCount: sessions.length,
      dateRange: displayDateRange(dates, requestedRange),
      detectedHosts: hosts.map((host) => host.name),
      unclearRows: unclearRows.length,
      totalGmv: round2(totalGmv),
      totalOrders: round0(totalOrders),
      totalViews: round0(totalViews),
    },
    hosts,
    timing,
    recommendations: makeRecommendations(hosts),
    unclearRows: unclearRows.slice(0, 50),
    sessions,
  };
}

function parseFileNames(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function readDateRange(formData: FormData): DateRangeFilter {
  return {
    startDate: String(formData.get("startDate") ?? "").trim(),
    endDate: String(formData.get("endDate") ?? "").trim(),
  };
}

function normalizeDateRange(dateRange: DateRangeFilter): Required<DateRangeFilter> {
  const startDate = normalizeInputDate(dateRange.startDate);
  const endDate = normalizeInputDate(dateRange.endDate);
  if (startDate && endDate && startDate > endDate) {
    throw new Error("Start date must be before or equal to end date.");
  }
  return { startDate, endDate };
}

function normalizeInputDate(value: string | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Unsupported date range value: ${text}. Use YYYY-MM-DD.`);
  }
  return text;
}

function inDateRange(date: string, range: Required<DateRangeFilter>) {
  if (range.startDate && date < range.startDate) return false;
  if (range.endDate && date > range.endDate) return false;
  return true;
}

function displayDateRange(dates: string[], requestedRange?: Required<DateRangeFilter>) {
  if (!dates.length) return "No dates detected";
  const actual = `${dates[0]} to ${dates[dates.length - 1]}`;
  if (!requestedRange?.startDate && !requestedRange?.endDate) return actual;
  const requestedStart = requestedRange.startDate || "first uploaded date";
  const requestedEnd = requestedRange.endDate || "last uploaded date";
  return `${actual} (selected ${requestedStart} to ${requestedEnd})`;
}

function makeHostReport(
  host: string,
  data: MetricBucket = blankMetrics(),
  timingMap: Map<string, MetricBucket> = new Map(),
): HostReport {
  const best = timingOrder
    .map(([slot, label]) => {
      const timing = timingMap.get(slot) ?? blankMetrics();
      return { label, gmvHour: ratio(timing.gmv, timing.hours) };
    })
    .sort((a, b) => b.gmvHour - a.gmvHour)[0];

  return {
    name: host,
    gmv: round2(data.gmv),
    hours: round2(data.hours),
    gmvHour: round0(ratio(data.gmv, data.hours)),
    orders: round0(data.orders),
    views: round0(data.views),
    viewerCvr: round2(ratio(data.orders, data.views) * 100),
    atcOrder: round2(ratio(data.orders, data.atc) * 100),
    costRoi: round2(ratio(data.gmv, salaryByHost[host] ?? 0)),
    peakShare: round1(ratio(data.peakHours, data.hours) * 100),
    campaign: timingGmvHour(timingMap, "Campaign peak date"),
    late: timingGmvHour(timingMap, "Late night peak start"),
    night: timingGmvHour(timingMap, "Night peak start"),
    noon: timingGmvHour(timingMap, "Noon peak start"),
    offPeak: timingGmvHour(timingMap, "Off-peak start"),
    read: makeHostRead(host, data, best),
  };
}

function makeHostRead(host: string, data: MetricBucket, best: { label: string; gmvHour: number }) {
  const bestText = `${best.label} (${round0(best.gmvHour)}/hr)`;
  const cvr = ratio(data.orders, data.views) * 100;
  if (host === "Zati" && ratio(data.peakHours, data.hours) < 0.15) {
    return "Very low expanded-peak exposure. Schedule may be hiding her ceiling; test promo dates or late night.";
  }
  if (cvr < 1.35) {
    return `Best signal is ${bestText}, but conversion is below stronger hosts. Review script and product mix before scaling.`;
  }
  return `Best signal is ${bestText}. Keep comparing this against off-peak before assigning more premium slots.`;
}

function makeRecommendations(hosts: HostReport[]): [string, string, string][] {
  const byCampaign = [...hosts].filter((host) => host.campaign > 0).sort((a, b) => b.campaign - a.campaign);
  const byLate = [...hosts].filter((host) => host.late > 0).sort((a, b) => b.late - a.late);
  const byNight = [...hosts].filter((host) => host.night > 0).sort((a, b) => b.night - a.night);
  const lowPeak = [...hosts].filter((host) => host.peakShare < 15).sort((a, b) => b.gmvHour - a.gmvHour);
  const weak = [...hosts].filter((host) => host.viewerCvr < 1.35).sort((a, b) => a.viewerCvr - b.viewerCvr);

  return [
    ["Promo-date priority", names(byCampaign, 4), "Campaign dates are the strongest period; prioritize hosts with proven campaign GMV/hour."],
    ["Late-night priority", names(byLate, 3), "10pm-12am should be treated as a high-value slot when enough host history exists."],
    ["8-10pm priority", names(byNight, 3), "Use 8-10pm for hosts with strong conversion or clear GMV/hour lift."],
    ["Test more peak slots", names(lowPeak, 3), "Low peak exposure means the current monthly total may understate their ceiling."],
    ["Improve before scaling", names(weak, 3), "Conversion is below the team leaders; improve script, product mix, or offer before more premium slots."],
  ];
}

function names(hosts: HostReport[], count: number) {
  return hosts.slice(0, count).map((host) => host.name).join(", ") || "-";
}

function addSession(bucket: MetricBucket | undefined, session: ParsedSession) {
  if (!bucket) return;
  bucket.sessions += 1;
  bucket.hours += session.hours;
  bucket.gmv += session.gmv;
  bucket.orders += session.orders;
  bucket.views += session.views;
  bucket.atc += session.atc;
  bucket.items += session.items;
  bucket.peakHours += session.peakHours;
}

function timingGmvHour(timingMap: Map<string, MetricBucket>, slot: string) {
  const timing = timingMap.get(slot) ?? blankMetrics();
  return round0(ratio(timing.gmv, timing.hours));
}

function blankMetrics(): MetricBucket {
  return { sessions: 0, hours: 0, gmv: 0, orders: 0, views: 0, atc: 0, items: 0, peakHours: 0 };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const clean = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    const next = clean[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift();
  if (!headers) return [];
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), values[index] ?? ""])),
  );
}

function decodeCsv(bytes: ArrayBuffer) {
  return new TextDecoder("utf-8").decode(bytes);
}

function asNumber(value: unknown) {
  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

function durationHours(value: unknown) {
  const parts = String(value ?? "0:0:0").split(":").map(Number);
  if (parts.length === 3) return parts[0] + parts[1] / 60 + parts[2] / 3600;
  if (parts.length === 2) return parts[0] / 60 + parts[1] / 3600;
  return parts[0] || 0;
}

function parseStart(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialDate(value);
  }

  const text = String(value ?? "").trim();
  const match =
    text.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/) ??
    text.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/);
  if (!match) throw new Error(`Unsupported Start Time: ${text}`);
  if (text.includes("/")) {
    const [, yyyy, mm, dd, hh, min] = match.map(Number);
    return new Date(yyyy, mm - 1, dd, hh, min);
  }
  const [, dd, mm, yyyy, hh, min] = match.map(Number);
  return new Date(yyyy, mm - 1, dd, hh, min);
}

function excelSerialDate(serial: number) {
  const wholeDays = Math.floor(serial);
  const fractionalDay = serial - wholeDays;
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const date = new Date(epoch.getTime() + wholeDays * 86400000);
  const totalMinutes = Math.round(fractionalDay * 1440);
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    Math.floor(totalMinutes / 60),
    totalMinutes % 60,
  );
}

function overlapHours(start: Date, hours: number, startHour: number, endHour: number) {
  const end = new Date(start.getTime() + hours * 3600 * 1000);
  let total = 0;
  for (const addDay of [0, 1]) {
    const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() + addDay);
    const windowStart = new Date(dayStart.getTime() + startHour * 3600 * 1000);
    const windowEnd = new Date(dayStart.getTime() + endHour * 3600 * 1000);
    const overlapMs = Math.max(0, Math.min(end.getTime(), windowEnd.getTime()) - Math.max(start.getTime(), windowStart.getTime()));
    total += overlapMs / 3600000;
  }
  return Math.min(total, hours);
}

function peakHours(start: Date, hours: number) {
  if (start.getMonth() === 6 && campaignDays.has(start.getDate())) return hours;
  return Math.min(
    hours,
    overlapHours(start, hours, 12, 14) +
      overlapHours(start, hours, 20, 22) +
      overlapHours(start, hours, 22, 24),
  );
}

function timingSlot(start: Date) {
  if (start.getMonth() === 6 && campaignDays.has(start.getDate())) return "Campaign peak date";
  const minutes = start.getHours() * 60 + start.getMinutes();
  if (minutes >= 22 * 60 && minutes < 24 * 60) return "Late night peak start";
  if (minutes >= 20 * 60 && minutes < 22 * 60) return "Night peak start";
  if (minutes >= 12 * 60 && minutes < 14 * 60) return "Noon peak start";
  return "Off-peak start";
}

function hostFromTitle(title: string) {
  const upper = title.toUpperCase().replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"));
  const candidates: string[] = [];
  const withMatch = upper.match(/\b(?:WITH|W)\s+([A-Z0-9]+)/);
  if (withMatch) candidates.push(withMatch[1]);
  candidates.push(...(upper.match(/[A-Z0-9]+/g) ?? []));
  for (const candidate of candidates) {
    if (hostAliases[candidate]) return hostAliases[candidate];
  }
  return "Unclear";
}

function stableKey(fileName: string, rowNumber: number, startTime: string, title: string, duration: string) {
  return `${safeFileName(fileName)}:${rowNumber}:${startTime}:${title}:${duration}`;
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function guessContentType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  return "application/octet-stream";
}

function formatMonthTitle(isoDate: string) {
  const [year, month] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function ratio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

function round0(value: number) {
  return Math.round(value);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
