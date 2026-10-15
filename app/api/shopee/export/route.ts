import * as XLSX from "xlsx";
import { getCombinedDashboard } from "@/lib/data";
import { datesInWindow } from "@/lib/calculations";

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function includedDates(start: string, end: string) {
  return datesInWindow(start, end).map(displayDate).join(", ");
}

export async function GET() {
  const dashboard = await getCombinedDashboard();
  const workbook = XLSX.utils.book_new();
  const cycleHeaders = dashboard.cycles.flatMap((cycle) => [
    `Cycle ${cycle.cycle} Orders`,
    `Cycle ${cycle.cycle} Goal`,
    `Cycle ${cycle.cycle} Status`,
    `Cycle ${cycle.cycle} Sales (RM)`,
  ]);

  const summaryRows: Array<Array<string | number | null>> = [
    ["CHANDO Flash Sale Continuous Cycle Tracker"],
    [dashboard.campaign.name],
    ["Confirmed Order basis", "Flash PMS excluded"],
    [],
    [
      "Cycle",
      "Dates",
      "Sessions",
      "Impressions",
      "Clicks",
      "CTR",
      "Confirmed Sales (RM)",
      "Orders",
      "Units",
      "CVR",
      "AOV (RM)",
    ],
    ...dashboard.cycles.map((cycle) => [
      `Cycle ${cycle.cycle}`,
      includedDates(cycle.startDate, cycle.endDate),
      cycle.sessions,
      cycle.impressions,
      cycle.clicks,
      cycle.ctr,
      cycle.sales,
      cycle.orders,
      cycle.units,
      cycle.cvr,
      cycle.aov,
    ]),
    [],
    [
      "Each cycle is a shared 3-day window from 24 Jul 2026. New listings are included in the cycle where they first sell; earlier cycles stay zero.",
    ],
    [
      "Item / Variation ID",
      "Listing / Variation",
      "SKU",
      ...dashboard.cycles.map((cycle) => `Cycle ${cycle.cycle} Dates`),
      ...cycleHeaders,
      "Current Streak",
      "Best Streak",
      "Active Baseline Cycle",
      "Active Baseline Orders",
      "Selected Path Status",
      "Ready To Complete",
      "Manual Done Complete",
      "Total Orders",
      "Confirmed Sales (RM)",
    ],
  ];
  for (const listing of dashboard.listings) {
    summaryRows.push([
      listing.itemId,
      listing.listingTitle,
      "",
      ...dashboard.cycles.map((cycle) =>
        includedDates(cycle.startDate, cycle.endDate),
      ),
      ...listing.cycles.flatMap((cycle, index) => [
        cycle.orders,
        listing.goals[index] ?? "",
        listing.cycleStatuses[index],
        cycle.sales,
      ]),
      listing.successStreak,
      listing.longestSuccessStreak,
      listing.activeBaselineCycle ?? "",
      listing.activeBaselineOrders ?? "",
      listing.selectedPathStatus ?? "",
      listing.readyToComplete ? "Yes" : "No",
      listing.doneComplete ? "Yes" : "No",
      listing.total.orders,
      listing.total.sales,
    ]);
    for (const variation of listing.variations) {
      summaryRows.push([
        variation.variationId,
        `↳ ${variation.variationTitle}`,
        variation.sku,
        ...dashboard.cycles.map(() => ""),
        ...variation.cycles.flatMap((cycle) => [
          cycle.orders,
          "",
          "",
          cycle.sales,
        ]),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        variation.total.orders,
        variation.total.sales,
      ]);
    }
  }
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summary["!cols"] = [
    { wch: 18 },
    { wch: 62 },
    { wch: 28 },
    ...Array.from({ length: dashboard.cycles.length }, () => ({ wch: 34 })),
    ...Array.from({ length: dashboard.cycles.length * 4 + 9 }, () => ({
      wch: 16,
    })),
  ];
  XLSX.utils.book_append_sheet(workbook, summary, "Dashboard");

  const uploads = XLSX.utils.json_to_sheet(
    dashboard.uploads.map((upload) => ({
      Status: upload.active ? "Active" : "Replaced",
      "Session Start": upload.sessionStart,
      "Session End": upload.sessionEnd,
      "Source File": upload.sourceFile,
      Revision: upload.revision,
      "Uploaded By": upload.uploadedBy,
      "Uploaded At": upload.createdAt,
    })),
  );
  uploads["!cols"] = [
    { wch: 12 },
    { wch: 20 },
    { wch: 20 },
    { wch: 62 },
    { wch: 10 },
    { wch: 28 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(workbook, uploads, "Upload History");

  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const filename = "CHANDO_Flash_Sale_Combined_Cycle_Tracker.xlsx";
  return new Response(bytes, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
