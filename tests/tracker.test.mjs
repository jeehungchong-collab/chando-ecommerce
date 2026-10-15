import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildPerformance,
  buildRestartPerformance,
  calculateGoals,
  calculateRollingCyclePlan,
  completedFailedCycles,
  cycleIndexForSession,
  datesInWindow,
  getCycleWindows,
  restartCycleIndexForSession,
} from "../lib/calculations.ts";
import { parseFlashSaleWorkbook } from "../lib/parser.ts";

test("uses four shared, start-inclusive and end-exclusive 3-day cycles", () => {
  assert.deepEqual(getCycleWindows("2026-07-24"), [
    { cycle: 1, startDate: "2026-07-24", endDate: "2026-07-27" },
    { cycle: 2, startDate: "2026-07-27", endDate: "2026-07-30" },
    { cycle: 3, startDate: "2026-07-30", endDate: "2026-08-02" },
    { cycle: 4, startDate: "2026-08-02", endDate: "2026-08-05" },
  ]);
  assert.equal(cycleIndexForSession("2026-07-24", "2026-07-27 00:00"), 1);
  assert.equal(cycleIndexForSession("2026-07-24", "2026-08-05 00:00"), -1);
  assert.deepEqual(datesInWindow("2026-07-31 00:00", "2026-08-03 00:00"), [
    "2026-07-31",
    "2026-08-01",
    "2026-08-02",
  ]);
});

test("selects one clear active or completed baseline path", () => {
  assert.deepEqual(calculateGoals([1, 0, 0, 0]), [1, 2, null, null]);
  assert.deepEqual(calculateGoals([2, 0, 8, 12]), [null, null, null, 12]);
  assert.deepEqual(calculateGoals([3, 6, 3, 18]), [null, null, 3, 6]);
  assert.deepEqual(calculateGoals([0, 1, 2, 0]), [null, null, 2, 4]);
  assert.deepEqual(calculateGoals([0, 0, 2, 0]), [null, null, 2, 4]);
});

test("keeps only the selected path marked in cycle cells", () => {
  assert.deepEqual(calculateRollingCyclePlan([1, 2, 0, 7]).statuses, [
    "waiting",
    "waiting",
    "waiting",
    "baseline",
  ]);
  assert.deepEqual(calculateRollingCyclePlan([2, 0, 8, 12]).statuses, [
    "waiting",
    "waiting",
    "waiting",
    "baseline",
  ]);
  assert.deepEqual(calculateRollingCyclePlan([3, 6, 3, 18]).statuses, [
    "waiting",
    "waiting",
    "baseline",
    "pass",
  ]);
});

test("requires four consecutive successful cycles before completion", () => {
  const scatteredWins = calculateRollingCyclePlan([2, 0, 8, 12, 10, 0]);
  assert.deepEqual(
    {
      successStreak: scatteredWins.successStreak,
      longestSuccessStreak: scatteredWins.longestSuccessStreak,
      readyToComplete: scatteredWins.readyToComplete,
    },
    {
      successStreak: 0,
      longestSuccessStreak: 1,
      readyToComplete: false,
    },
  );

  const laterFourCycleRun = calculateRollingCyclePlan([2, 0, 1, 2, 3, 4]);
  assert.deepEqual(
    {
      successStreak: laterFourCycleRun.successStreak,
      longestSuccessStreak: laterFourCycleRun.longestSuccessStreak,
      readyToComplete: laterFourCycleRun.readyToComplete,
    },
    {
      successStreak: 4,
      longestSuccessStreak: 4,
      readyToComplete: true,
    },
  );
});

test("handles screenshot examples as rolling restart attempts", () => {
  const dailyMask = calculateRollingCyclePlan([0, 1, 1, 1, 2, 2]);
  assert.deepEqual(dailyMask.statuses, [
    "waiting",
    "waiting",
    "waiting",
    "waiting",
    "waiting",
    "baseline",
  ]);
  assert.deepEqual(dailyMask.goals, [null, null, null, null, null, 2]);
  assert.equal(dailyMask.successStreak, 1);
  assert.equal(dailyMask.longestSuccessStreak, 2);
  assert.equal(dailyMask.activeBaselineCycle, 6);
  assert.equal(dailyMask.activeBaselineOrders, 2);
  assert.equal(dailyMask.selectedPathStatus, "active");

  const probioticMask = calculateRollingCyclePlan([1, 1, 0, 1, 1, 2]);
  assert.deepEqual(probioticMask.statuses, [
    "waiting",
    "waiting",
    "waiting",
    "waiting",
    "baseline",
    "pass",
  ]);
  assert.deepEqual(probioticMask.goals, [null, null, null, null, 1, 2]);
  assert.equal(probioticMask.successStreak, 2);
  assert.equal(probioticMask.longestSuccessStreak, 2);
  assert.equal(probioticMask.activeBaselineCycle, 5);
  assert.equal(probioticMask.activeBaselineOrders, 1);
  assert.equal(probioticMask.selectedPathStatus, "active");
});

test("matches the confirmed latest screenshot marking", () => {
  const completedShampoo = calculateRollingCyclePlan([2, 5, 7, 11, 0, 0]);
  assert.deepEqual(completedShampoo.statuses, [
    "baseline",
    "pass",
    "pass",
    "pass",
    "waiting",
    "waiting",
  ]);
  assert.equal(completedShampoo.readyToComplete, true);
  assert.equal(completedShampoo.selectedPathStatus, "complete");
  assert.equal(completedShampoo.activeBaselineCycle, 1);

  const maskPlant = calculateRollingCyclePlan([2, 4, 4, 4, 1, 2]);
  assert.deepEqual(maskPlant.statuses, [
    "waiting",
    "waiting",
    "waiting",
    "waiting",
    "baseline",
    "pass",
  ]);
  assert.deepEqual(maskPlant.goals, [null, null, null, null, 1, 2]);
  assert.equal(maskPlant.successStreak, 2);
  assert.equal(maskPlant.longestSuccessStreak, 2);
  assert.equal(maskPlant.selectedPathStatus, "active");
  assert.equal(maskPlant.activeBaselineCycle, 5);

  const bodyWash = calculateRollingCyclePlan([2, 3, 3, 0, 9, 0]);
  assert.deepEqual(bodyWash.statuses, [
    "waiting",
    "waiting",
    "waiting",
    "waiting",
    "baseline",
    "fail",
  ]);
  assert.equal(bodyWash.successStreak, 0);
  assert.equal(bodyWash.selectedPathStatus, "failed");
  assert.equal(bodyWash.activeBaselineCycle, 5);

  const drySkin = calculateRollingCyclePlan([3, 2, 1, 1, 6, 0]);
  assert.deepEqual(drySkin.statuses, [
    "waiting",
    "waiting",
    "waiting",
    "waiting",
    "baseline",
    "fail",
  ]);
  assert.equal(drySkin.selectedPathStatus, "failed");
  assert.equal(drySkin.activeBaselineCycle, 5);

  const serum = calculateRollingCyclePlan([0, 0, 0, 0, 0, 1]);
  assert.deepEqual(serum.statuses, [
    "waiting",
    "waiting",
    "waiting",
    "waiting",
    "waiting",
    "baseline",
  ]);
  assert.equal(serum.selectedPathStatus, "active");
  assert.equal(serum.activeBaselineCycle, 6);
});

test("marks only failed cycles whose windows have already closed", () => {
  const windows = getCycleWindows("2026-07-24");
  assert.deepEqual(
    completedFailedCycles(
      [2, 3, 4, 0],
      [2, 4, 6, 8],
      windows,
      "2026-08-04 12:00",
    ),
    [2, 3],
  );
  assert.deepEqual(
    completedFailedCycles(
      [2, 3, 4, 0],
      [2, 4, 6, 8],
      windows,
      "2026-07-29 23:59",
    ),
    [],
  );
});

test("parses the real Shopee Confirmed Order export at listing and variation level", async () => {
  const fixture = new URL(
    "../../data/flash-sale-tracker/source/Shop_Flash_Sale_datail_28-07-2026 12_00-14_00_28072026.xlsx",
    import.meta.url,
  );
  const file = await readFile(fixture);
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const parsed = parseFlashSaleWorkbook(bytes);
  assert.equal(parsed.sessionStart, "2026-07-28 12:00");
  assert.equal(parsed.sessionEnd, "2026-07-28 14:00");
  assert.equal(parsed.sessionKey, "2026-07-28 12:00|2026-07-28 14:00");
  assert.ok(parsed.listings.length > 0);
  assert.ok(parsed.variations.length > 0);
  assert.ok(parsed.variations.every((row) => row.variationTitle !== row.listingTitle));
  assert.equal(
    parsed.listings.reduce((sum, row) => sum + row.confirmedOrders, 0),
    2,
  );
});

test("team tracker begins with zero orders and listings", () => {
  const result = buildPerformance("2026-07-24", [], []);
  assert.equal(result.totals.orders, 0);
  assert.equal(result.listings.length, 0);
});

test("continues shared 3-day cycles and includes new listings in later cycles", () => {
  const listingRows = [
    {
      item_id: "old-listing",
      listing_title: "Original Listing",
      session_start: "2026-07-24 12:00",
      sales: 10,
      orders: 1,
      units: 1,
      reminder_clicks: 0,
      impressions: 10,
      clicks: 1,
    },
    {
      item_id: "new-listing",
      listing_title: "New Later Listing",
      session_start: "2026-08-08 20:00",
      sales: 104.3,
      orders: 1,
      units: 1,
      reminder_clicks: 0,
      impressions: 20,
      clicks: 2,
    },
  ];
  const variationRows = listingRows.map((row) => ({
    item_id: row.item_id,
    listing_title: row.listing_title,
    variation_id: `${row.item_id}-variation`,
    variation_title: `${row.listing_title} Variation`,
    sku: `${row.item_id}-sku`,
    session_start: row.session_start,
    sales: row.sales,
    orders: row.orders,
    units: row.units,
  }));
  const result = buildPerformance("2026-07-24", listingRows, variationRows);
  assert.equal(result.cycles.length, 6);
  assert.deepEqual(
    result.cycles.map((cycle) => cycle.startDate),
    [
      "2026-07-24",
      "2026-07-27",
      "2026-07-30",
      "2026-08-02",
      "2026-08-05",
      "2026-08-08",
    ],
  );
  const newListing = result.listings.find(
    (listing) => listing.itemId === "new-listing",
  );
  assert.deepEqual(
    newListing.cycles.map((cycle) => cycle.orders),
    [0, 0, 0, 0, 0, 1],
  );
  assert.equal(result.cycles[5].orders, 1);
  assert.equal(result.cycles[5].sales, 104.3);
});

test("uses the baseline date as Day 1 of a full restart Cycle 1", () => {
  const restartItems = [
    {
      item_id: "42463964520",
      listing_title: "Dry Skin Mask",
      baseline_upload_id: "u-dry",
      baseline_session_start: "2026-07-28 20:00",
      baseline_session_end: "2026-07-29 00:00",
      baseline_sales: 64.99,
      baseline_orders: 1,
      baseline_units: 1,
      baseline_reminder_clicks: 0,
      baseline_impressions: 50,
      baseline_clicks: 5,
    },
    {
      item_id: "49507183670",
      listing_title: "200g Shampoo & Body Wash",
      baseline_upload_id: "u-body",
      baseline_session_start: "2026-07-28 20:00",
      baseline_session_end: "2026-07-29 00:00",
      baseline_sales: 27.99,
      baseline_orders: 1,
      baseline_units: 1,
      baseline_reminder_clicks: 1,
      baseline_impressions: 40,
      baseline_clicks: 4,
    },
    {
      item_id: "41818260936",
      listing_title: "Probiotic Repair Mask",
      baseline_upload_id: "u-repair",
      baseline_session_start: "2026-07-29 20:00",
      baseline_session_end: "2026-07-30 00:00",
      baseline_sales: 169.91,
      baseline_orders: 1,
      baseline_units: 1,
      baseline_reminder_clicks: 1,
      baseline_impressions: 84,
      baseline_clicks: 8,
    },
  ];
  assert.equal(
    restartCycleIndexForSession(restartItems[0], "2026-07-31 00:00"),
    1,
  );
  assert.equal(
    restartCycleIndexForSession(restartItems[0], "2026-08-03 00:00"),
    2,
  );
  assert.equal(
    restartCycleIndexForSession(restartItems[0], "2026-08-09 00:00"),
    -1,
  );
  assert.equal(
    restartCycleIndexForSession(restartItems[2], "2026-07-29 20:00"),
    -1,
  );

  const baselineVariations = restartItems.map((item, index) => ({
    item_id: item.item_id,
    listing_title: item.listing_title,
    variation_id: `v-${index}`,
    variation_title: `Variation ${index}`,
    sku: `SKU-${index}`,
    session_start: item.baseline_session_start,
    sales: item.baseline_sales,
    orders: 1,
    units: 1,
  }));
  const futureListings = [
    {
      item_id: "42463964520",
      listing_title: "Dry Skin Mask",
      session_start: "2026-07-31 00:00",
      sales: 0,
      orders: 0,
      units: 0,
      reminder_clicks: 0,
      impressions: 10,
      clicks: 1,
    },
    {
      item_id: "41818260936",
      listing_title: "Probiotic Repair Mask",
      session_start: "2026-08-01 00:00",
      sales: 339.82,
      orders: 2,
      units: 2,
      reminder_clicks: 0,
      impressions: 20,
      clicks: 2,
    },
    {
      item_id: "42463964520",
      listing_title: "Dry Skin Mask",
      session_start: "2026-08-03 00:00",
      sales: 194.97,
      orders: 3,
      units: 3,
      reminder_clicks: 0,
      impressions: 30,
      clicks: 3,
    },
  ];
  const futureVariations = futureListings.map((row, index) => ({
    item_id: row.item_id,
    listing_title: row.listing_title,
    variation_id: row.item_id === "42463964520" ? "v-0" : "v-2",
    variation_title: `Future ${index}`,
    sku: row.item_id === "42463964520" ? "SKU-0" : "SKU-2",
    session_start: row.session_start,
    sales: row.sales,
    orders: row.orders,
    units: row.units,
  }));
  const result = buildRestartPerformance(
    restartItems,
    baselineVariations,
    futureListings,
    futureVariations,
  );
  assert.equal(result.listings.length, 3);
  assert.ok(
    result.listings.every(
      (listing) =>
        JSON.stringify(listing.goals) === JSON.stringify([1, 2, 3, 4]),
    ),
  );
  const dry = result.listings.find(
    (listing) => listing.itemId === "42463964520",
  );
  const repair = result.listings.find(
    (listing) => listing.itemId === "41818260936",
  );
  assert.deepEqual(
    dry.cycleWindows.map((window) => [window.startDate, window.endDate]),
    [
      ["2026-07-28 00:00", "2026-07-31 00:00"],
      ["2026-07-31 00:00", "2026-08-03 00:00"],
      ["2026-08-03 00:00", "2026-08-06 00:00"],
      ["2026-08-06 00:00", "2026-08-09 00:00"],
    ],
  );
  assert.deepEqual(
    repair.cycleWindows.map((window) => [window.startDate, window.endDate]),
    [
      ["2026-07-29 00:00", "2026-08-01 00:00"],
      ["2026-08-01 00:00", "2026-08-04 00:00"],
      ["2026-08-04 00:00", "2026-08-07 00:00"],
      ["2026-08-07 00:00", "2026-08-10 00:00"],
    ],
  );
  assert.equal(dry.cycles[1].orders, 0);
  assert.equal(dry.cycles[2].orders, 3);
  assert.equal(repair.cycles[0].orders, 1);
  assert.equal(repair.cycles[1].orders, 2);
  for (const listing of result.listings) {
    assert.equal(
      listing.total.orders,
      listing.variations.reduce(
        (sum, variation) => sum + variation.total.orders,
        0,
      ),
    );
  }
});
