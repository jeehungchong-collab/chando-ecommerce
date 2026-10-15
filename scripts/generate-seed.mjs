import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const sourcePath = process.argv[2];
const outputPath = process.argv[3];

if (!sourcePath || !outputPath) {
  throw new Error("Usage: node scripts/generate-seed.mjs <tracker.xlsx> <output.json>");
}

const workbook = XLSX.readFile(sourcePath, { cellDates: true });

function rows(sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Missing sheet: ${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
}

function isoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "");
}

const listingRows = rows("Flash Sale Data").slice(1).filter((row) => row[4]);
const variationRows = rows("SKU Data").slice(1).filter((row) => row[4] && row[6]);
const sessionKeys = new Map();

for (const row of listingRows) {
  const key = `${row[1]}|${row[2]}`;
  if (!sessionKeys.has(key)) {
    sessionKeys.set(key, {
      sessionKey: key,
      sessionDate: String(row[1]).slice(0, 10) || isoDate(row[0]),
      sessionStart: String(row[1]),
      sessionEnd: String(row[2]),
      sourceFile: String(row[3]),
    });
  }
}

const payload = {
  campaign: {
    id: "campaign-july-2026",
    name: "July Flash Sale · 4-Cycle Sprint",
    slug: "july-2026",
    startDate: "2026-07-24",
  },
  sessions: [...sessionKeys.values()],
  listings: listingRows.map((row) => ({
    sessionKey: `${row[1]}|${row[2]}`,
    itemId: String(row[4]),
    listingTitle: String(row[5] ?? ""),
    confirmedSales: Number(row[6] ?? 0),
    confirmedOrders: Number(row[7] ?? 0),
    unitsSold: Number(row[8] ?? 0),
    reminderClicks: Number(row[9] ?? 0),
    impressions: Number(row[10] ?? 0),
    clicks: Number(row[11] ?? 0),
  })),
  variations: variationRows.map((row) => ({
    sessionKey: `${row[1]}|${row[2]}`,
    itemId: String(row[4]),
    listingTitle: String(row[5] ?? ""),
    variationId: String(row[6]),
    variationTitle: String(row[7] ?? ""),
    sku: String(row[8] ?? ""),
    confirmedSales: Number(row[9] ?? 0),
    confirmedOrders: Number(row[10] ?? 0),
    unitsSold: Number(row[11] ?? 0),
  })),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
