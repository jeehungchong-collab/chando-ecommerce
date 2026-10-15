import * as XLSX from "xlsx";
import type { ParsedFlashSaleFile } from "./types";

function numberValue(value: unknown): number {
  if (value === null || value === undefined || value === "" || value === "-") {
    return 0;
  }
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePeriod(value: unknown) {
  const text = String(value ?? "").trim();
  const match = text.match(
    /(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})\s*-\s*(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/,
  );
  if (!match) {
    throw new Error(
      "The Confirmed Order sheet has an invalid Date Period. Export the file again from Shopee.",
    );
  }
  const [, sd, sm, sy, sh, smin, ed, em, ey, eh, emin] = match;
  const sessionStart = `${sy}-${sm}-${sd} ${sh}:${smin}`;
  const sessionEnd = `${ey}-${em}-${ed} ${eh}:${emin}`;
  return {
    sessionStart,
    sessionEnd,
    sessionKey: `${sessionStart}|${sessionEnd}`,
  };
}

export function parseFlashSaleWorkbook(
  bytes: ArrayBuffer,
): ParsedFlashSaleFile {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: "array", raw: true });
  } catch {
    throw new Error("This file could not be read as an Excel workbook.");
  }

  const sheet = workbook.Sheets["Confirmed Order"];
  if (!sheet) {
    throw new Error('Missing required sheet: "Confirmed Order".');
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
  const period = parsePeriod(rows[2]?.[1]);
  const header = rows[9]?.map((value) => String(value ?? "").trim()) ?? [];
  const required = [
    "Item ID",
    "Product",
    "Variation ID",
    "Variation",
    "SKU",
    "Sales(RM)",
    "Orders",
    "Units Sold",
  ];
  for (const column of required) {
    if (!header.includes(column)) {
      throw new Error(`Unsupported Shopee export: missing "${column}" column.`);
    }
  }

  const listings = [];
  const variations = [];
  for (const row of rows.slice(10)) {
    const itemId = String(row[1] ?? "").trim();
    if (!itemId) continue;
    const listingTitle = String(row[2] ?? "").trim();
    const variationId = String(row[3] ?? "").trim();
    if (variationId === "-") {
      listings.push({
        itemId,
        listingTitle,
        confirmedSales: numberValue(row[9]),
        confirmedOrders: numberValue(row[10]),
        unitsSold: numberValue(row[11]),
        reminderClicks: numberValue(row[12]),
        impressions: numberValue(row[13]),
        clicks: numberValue(row[14]),
      });
    } else if (variationId) {
      variations.push({
        itemId,
        listingTitle,
        variationId,
        variationTitle: String(row[4] ?? "").trim(),
        sku: String(row[5] ?? "").trim(),
        confirmedSales: numberValue(row[9]),
        confirmedOrders: numberValue(row[10]),
        unitsSold: numberValue(row[11]),
      });
    }
  }
  if (listings.length === 0) {
    throw new Error("No listing-level rows were found in Product Rankings.");
  }
  return { ...period, listings, variations };
}
