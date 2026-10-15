import type {
  CycleWindow,
  CycleSummary,
  ListingPerformance,
  MetricTotals,
  VariationPerformance,
} from "./types";

export const EMPTY_METRICS: MetricTotals = {
  sales: 0,
  orders: 0,
  units: 0,
  reminderClicks: 0,
  impressions: 0,
  clicks: 0,
};

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function addDaysToTimestamp(timestamp: string, days: number): string {
  const value = new Date(`${timestamp.replace(" ", "T")}:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 16).replace("T", " ");
}

export function getCycleWindows(startDate: string, cycleCount = 4) {
  return Array.from({ length: cycleCount }, (_, index) => ({
    cycle: index + 1,
    startDate: addDays(startDate, index * 3),
    endDate: addDays(startDate, (index + 1) * 3),
  }));
}

function cycleCountForRows(campaignStart: string, rows: Array<{ session_start: string }>) {
  return Math.max(
    4,
    ...rows.map((row) => {
      const start = new Date(`${campaignStart}T00:00:00Z`).getTime();
      const session = new Date(`${row.session_start.slice(0, 10)}T00:00:00Z`).getTime();
      return Math.floor((session - start) / (3 * 24 * 60 * 60 * 1000)) + 1;
    }),
  );
}

export function datesInWindow(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const end = endDate.slice(0, 10);
  let current = startDate.slice(0, 10);
  while (current < end) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

export function completedFailedCycles(
  orders: number[],
  goals: Array<number | null>,
  windows: CycleWindow[],
  asOf: string,
): number[] {
  return windows
    .map((window, index) => {
      const end = window.endDate.includes(" ")
        ? window.endDate
        : `${window.endDate} 00:00`;
      const goal = goals[index];
      return goal !== null && asOf >= end && (orders[index] ?? 0) < goal
        ? index + 1
        : null;
    })
    .filter((cycle): cycle is number => cycle !== null);
}

export function cycleIndexForSession(
  campaignStart: string,
  sessionStart: string,
  cycleCount = 4,
): number {
  const sessionDate = sessionStart.slice(0, 10);
  return getCycleWindows(campaignStart, cycleCount).findIndex(
    (window) =>
      sessionDate >= window.startDate && sessionDate < window.endDate,
  );
}

export function calculateGoals(orders: number[]): Array<number | null> {
  return calculateRollingCyclePlan(orders).goals;
}

export function metricProgress(
  orders: number[],
  goals: Array<number | null>,
): Array<number | null> {
  return goals.map((goal, index) =>
    goal === null ? null : orders[index] / goal,
  );
}

export function cycleStatuses(
  orders: number[],
  goals: Array<number | null>,
): Array<"baseline" | "pass" | "fail" | "recovered" | "waiting"> {
  let hadFailureSinceLastPass = false;
  let baselineSeen = false;
  return goals.map((goal, index) => {
    if (goal === null) return "waiting";
    if (!baselineSeen) {
      baselineSeen = true;
      return (orders[index] ?? 0) >= goal ? "baseline" : "waiting";
    }
    if ((orders[index] ?? 0) >= goal) {
      const status = hadFailureSinceLastPass ? "recovered" : "pass";
      hadFailureSinceLastPass = false;
      return status;
    }
    hadFailureSinceLastPass = true;
    return "fail";
  });
}

export function successStreaks(
  statuses: Array<"baseline" | "pass" | "fail" | "recovered" | "waiting">,
): number[] {
  let streak = 0;
  return statuses.map((status) => {
    if (status === "baseline" || status === "pass" || status === "recovered") {
      streak += 1;
      return streak;
    }
    if (status === "fail") streak = 0;
    return streak;
  });
}

export function completionStreakSummary(
  statuses: Array<"baseline" | "pass" | "fail" | "recovered" | "waiting">,
) {
  const streaks = successStreaks(statuses);
  const successStreak = streaks.at(-1) ?? 0;
  const longestSuccessStreak = Math.max(0, ...streaks);
  return {
    successStreak,
    longestSuccessStreak,
    readyToComplete: longestSuccessStreak >= 4,
  };
}

export function calculateRollingCyclePlan(orders: number[]) {
  const goals: Array<number | null> = Array.from(
    { length: orders.length },
    () => null,
  );
  const statuses: Array<"baseline" | "pass" | "fail" | "recovered" | "waiting"> =
    Array.from({ length: orders.length }, () => "waiting");
  const streaks: number[] = Array.from({ length: orders.length }, () => 0);
  type Candidate = {
    startIndex: number;
    baseline: number;
    goals: Array<number | null>;
    statuses: Array<"baseline" | "pass" | "fail" | "recovered" | "waiting">;
    progress: number;
    failed: boolean;
    complete: boolean;
    evaluatedCycles: number;
  };
  const candidates: Candidate[] = [];

  for (let startIndex = 0; startIndex < orders.length; startIndex += 1) {
    const baseline = orders[startIndex] ?? 0;
    if (baseline <= 0) continue;
    const candidateGoals: Array<number | null> = Array.from(
      { length: orders.length },
      () => null,
    );
    const candidateStatuses: Candidate["statuses"] = Array.from(
      { length: orders.length },
      () => "waiting",
    );
    let progress = 0;
    let failed = false;
    const endIndex = Math.min(startIndex + 4, orders.length);

    for (let index = startIndex; index < endIndex; index += 1) {
      const goal = baseline * (index - startIndex + 1);
      candidateGoals[index] = goal;
      if ((orders[index] ?? 0) >= goal) {
        candidateStatuses[index] = index === startIndex ? "baseline" : "pass";
        progress += 1;
        continue;
      }
      candidateStatuses[index] = "fail";
      failed = true;
      break;
    }

    candidates.push({
      startIndex,
      baseline,
      goals: candidateGoals,
      statuses: candidateStatuses,
      progress,
      failed,
      complete: progress >= 4,
      evaluatedCycles: endIndex - startIndex,
    });
  }

  const completed = candidates
    .filter((candidate) => candidate.complete)
    .sort((a, b) => a.startIndex - b.startIndex)[0];
  const active = candidates
    .filter((candidate) => !candidate.complete && !candidate.failed)
    .sort(
      (a, b) =>
        b.progress - a.progress ||
        b.startIndex - a.startIndex,
    )[0];
  const latestFailed = candidates
    .filter((candidate) => !candidate.complete && candidate.failed)
    .sort((a, b) => b.startIndex - a.startIndex)[0];
  const selected = completed ?? active ?? latestFailed ?? null;
  const selectedPathStatus = completed
    ? "complete"
    : active
      ? "active"
      : latestFailed
        ? "failed"
        : null;
  const longestSuccessStreak = Math.max(
    0,
    ...candidates.map((candidate) => Math.min(candidate.progress, 4)),
  );

  if (selected) {
    for (let index = 0; index < orders.length; index += 1) {
      goals[index] = selected.goals[index];
      statuses[index] = selected.statuses[index];
    }
  }

  let successStreak = 0;
  if (selected?.complete) {
    successStreak = 4;
  } else if (selected && !selected.failed) {
    successStreak = selected.progress;
  }
  for (let index = 0; index < orders.length; index += 1) {
    if (statuses[index] === "baseline" || statuses[index] === "pass") {
      streaks[index] =
        index === selected?.startIndex ? 1 : (streaks[index - 1] ?? 0) + 1;
    }
  }

  return {
    goals,
    statuses,
    streaks,
    successStreak,
    longestSuccessStreak,
    readyToComplete: Boolean(completed),
    activeBaselineCycle: selected ? selected.startIndex + 1 : null,
    activeBaselineOrders: selected?.baseline ?? null,
    selectedPathStatus,
  };
}

export function sumMetrics(metrics: MetricTotals[]): MetricTotals {
  return metrics.reduce(
    (total, metric) => ({
      sales: total.sales + metric.sales,
      orders: total.orders + metric.orders,
      units: total.units + metric.units,
      reminderClicks: total.reminderClicks + metric.reminderClicks,
      impressions: total.impressions + metric.impressions,
      clicks: total.clicks + metric.clicks,
    }),
    { ...EMPTY_METRICS },
  );
}

export type ListingRow = {
  item_id: string;
  listing_title: string;
  session_start: string;
  sales: number;
  orders: number;
  units: number;
  reminder_clicks: number;
  impressions: number;
  clicks: number;
};

export type VariationRow = {
  item_id: string;
  listing_title: string;
  variation_id: string;
  variation_title: string;
  sku: string;
  session_start: string;
  sales: number;
  orders: number;
  units: number;
};

export function buildPerformance(
  campaignStart: string,
  listingRows: ListingRow[],
  variationRows: VariationRow[],
): { listings: ListingPerformance[]; cycles: CycleSummary[]; totals: MetricTotals } {
  const cycleWindows = getCycleWindows(
    campaignStart,
    cycleCountForRows(campaignStart, [...listingRows, ...variationRows]),
  );
  const listingMap = new Map<string, ListingPerformance>();
  const cycleSessions = cycleWindows.map(() => new Set<string>());

  for (const row of listingRows) {
    const cycleIndex = cycleIndexForSession(
      campaignStart,
      row.session_start,
      cycleWindows.length,
    );
    if (cycleIndex < 0) continue;
    cycleSessions[cycleIndex].add(row.session_start);
    const current =
      listingMap.get(row.item_id) ??
      ({
        itemId: row.item_id,
        listingTitle: row.listing_title,
        cycles: cycleWindows.map(() => ({ ...EMPTY_METRICS })),
        goals: cycleWindows.map(() => null),
        progress: cycleWindows.map(() => null),
        cycleStatuses: cycleWindows.map(() => "waiting"),
        successStreak: 0,
        longestSuccessStreak: 0,
        readyToComplete: false,
        activeBaselineCycle: null,
        activeBaselineOrders: null,
        selectedPathStatus: null,
        total: { ...EMPTY_METRICS },
        variations: [],
      } satisfies ListingPerformance);
    current.listingTitle = row.listing_title || current.listingTitle;
    const metric = current.cycles[cycleIndex];
    metric.sales += Number(row.sales || 0);
    metric.orders += Number(row.orders || 0);
    metric.units += Number(row.units || 0);
    metric.reminderClicks += Number(row.reminder_clicks || 0);
    metric.impressions += Number(row.impressions || 0);
    metric.clicks += Number(row.clicks || 0);
    listingMap.set(row.item_id, current);
  }

  const variationMap = new Map<string, VariationPerformance & { itemId: string }>();
  for (const row of variationRows) {
    const cycleIndex = cycleIndexForSession(
      campaignStart,
      row.session_start,
      cycleWindows.length,
    );
    if (cycleIndex < 0) continue;
    const key = `${row.item_id}|${row.variation_id}`;
    const current =
      variationMap.get(key) ??
      ({
        itemId: row.item_id,
        variationId: row.variation_id,
        variationTitle: row.variation_title,
        sku: row.sku,
        cycles: cycleWindows.map(() => ({ ...EMPTY_METRICS })),
        total: { ...EMPTY_METRICS },
      } satisfies VariationPerformance & { itemId: string });
    current.variationTitle = row.variation_title || current.variationTitle;
    current.sku = row.sku || current.sku;
    const metric = current.cycles[cycleIndex];
    metric.sales += Number(row.sales || 0);
    metric.orders += Number(row.orders || 0);
    metric.units += Number(row.units || 0);
    variationMap.set(key, current);
  }

  for (const variation of variationMap.values()) {
    variation.total = sumMetrics(variation.cycles);
    const listing = listingMap.get(variation.itemId);
    if (listing) {
      const { itemId: _itemId, ...performance } = variation;
      void _itemId;
      listing.variations.push(performance);
    }
  }

  const listings = [...listingMap.values()]
    .map((listing) => {
      listing.total = sumMetrics(listing.cycles);
      const plan = calculateRollingCyclePlan(
        listing.cycles.map((cycle) => cycle.orders),
      );
      listing.goals = plan.goals;
      listing.progress = metricProgress(
        listing.cycles.map((cycle) => cycle.orders),
        listing.goals,
      );
      listing.cycleStatuses = plan.statuses;
      listing.successStreak = plan.successStreak;
      listing.longestSuccessStreak = plan.longestSuccessStreak;
      listing.readyToComplete = plan.readyToComplete;
      listing.activeBaselineCycle = plan.activeBaselineCycle;
      listing.activeBaselineOrders = plan.activeBaselineOrders;
      listing.selectedPathStatus = plan.selectedPathStatus;
      listing.variations.sort(
        (a, b) =>
          b.total.orders - a.total.orders ||
          a.variationTitle.localeCompare(b.variationTitle),
      );
      return listing;
    })
    .sort(
      (a, b) =>
        b.total.orders - a.total.orders ||
        a.listingTitle.localeCompare(b.listingTitle),
    );

  const cycles = cycleWindows.map((window, index) => {
    const metric = sumMetrics(listings.map((listing) => listing.cycles[index]));
    return {
      ...window,
      ...metric,
      sessions: cycleSessions[index].size,
      ctr: metric.impressions > 0 ? metric.clicks / metric.impressions : 0,
      cvr: metric.clicks > 0 ? metric.orders / metric.clicks : 0,
      aov: metric.orders > 0 ? metric.sales / metric.orders : 0,
    };
  });

  return { listings, cycles, totals: sumMetrics(cycles) };
}

export type RestartItemRow = {
  item_id: string;
  listing_title: string;
  baseline_upload_id: string;
  baseline_session_start: string;
  baseline_session_end: string;
  baseline_sales: number;
  baseline_orders: number;
  baseline_units: number;
  baseline_reminder_clicks: number;
  baseline_impressions: number;
  baseline_clicks: number;
};

function restartWindows(item: RestartItemRow): CycleWindow[] {
  const cycleOneStart = `${item.baseline_session_start.slice(0, 10)} 00:00`;
  return Array.from({ length: 4 }, (_, index) => ({
    cycle: index + 1,
    startDate: addDaysToTimestamp(cycleOneStart, index * 3),
    endDate: addDaysToTimestamp(cycleOneStart, (index + 1) * 3),
  }));
}

export function restartCycleIndexForSession(
  item: RestartItemRow,
  sessionStart: string,
): number {
  return restartWindows(item).findIndex(
    (window, index) =>
      index > 0 &&
      sessionStart >= window.startDate &&
      sessionStart < window.endDate,
  );
}

export function buildRestartPerformance(
  restartItems: RestartItemRow[],
  baselineVariationRows: VariationRow[],
  futureListingRows: ListingRow[],
  futureVariationRows: VariationRow[],
): { listings: ListingPerformance[]; cycles: CycleSummary[]; totals: MetricTotals } {
  const itemMap = new Map(restartItems.map((item) => [item.item_id, item]));
  const cycleSessions = Array.from({ length: 4 }, () => new Set<string>());
  const listingMap = new Map<string, ListingPerformance>();

  for (const item of restartItems) {
    const cycles = Array.from({ length: 4 }, () => ({ ...EMPTY_METRICS }));
    cycles[0] = {
      sales: Number(item.baseline_sales || 0),
      orders: Number(item.baseline_orders || 0),
      units: Number(item.baseline_units || 0),
      reminderClicks: Number(item.baseline_reminder_clicks || 0),
      impressions: Number(item.baseline_impressions || 0),
      clicks: Number(item.baseline_clicks || 0),
    };
    cycleSessions[0].add(item.baseline_session_start);
    const goals = [
      item.baseline_orders,
      item.baseline_orders * 2,
      item.baseline_orders * 3,
      item.baseline_orders * 4,
    ];
    const statuses = cycleStatuses(
      cycles.map((cycle) => cycle.orders),
      goals,
    );
    listingMap.set(item.item_id, {
      itemId: item.item_id,
      listingTitle: item.listing_title,
      cycles,
      goals,
      progress: metricProgress(
        cycles.map((cycle) => cycle.orders),
        goals,
      ),
      cycleStatuses: statuses,
      ...completionStreakSummary(statuses),
      total: { ...EMPTY_METRICS },
      variations: [],
      cycleWindows: restartWindows(item),
      baselineSession: {
        startDate: item.baseline_session_start,
        endDate: item.baseline_session_end,
      },
    });
  }

  for (const row of futureListingRows) {
    const item = itemMap.get(row.item_id);
    const listing = listingMap.get(row.item_id);
    if (!item || !listing) continue;
    const cycleIndex = restartCycleIndexForSession(item, row.session_start);
    if (cycleIndex < 1) continue;
    cycleSessions[cycleIndex].add(row.session_start);
    const metric = listing.cycles[cycleIndex];
    metric.sales += Number(row.sales || 0);
    metric.orders += Number(row.orders || 0);
    metric.units += Number(row.units || 0);
    metric.reminderClicks += Number(row.reminder_clicks || 0);
    metric.impressions += Number(row.impressions || 0);
    metric.clicks += Number(row.clicks || 0);
  }

  const variationMap = new Map<
    string,
    VariationPerformance & { itemId: string }
  >();
  const addVariation = (row: VariationRow, cycleIndex: number) => {
    const key = `${row.item_id}|${row.variation_id}`;
    const current =
      variationMap.get(key) ??
      ({
        itemId: row.item_id,
        variationId: row.variation_id,
        variationTitle: row.variation_title,
        sku: row.sku,
        cycles: Array.from({ length: 4 }, () => ({ ...EMPTY_METRICS })),
        total: { ...EMPTY_METRICS },
      } satisfies VariationPerformance & { itemId: string });
    current.variationTitle = row.variation_title || current.variationTitle;
    current.sku = row.sku || current.sku;
    const metric = current.cycles[cycleIndex];
    metric.sales += Number(row.sales || 0);
    metric.orders += Number(row.orders || 0);
    metric.units += Number(row.units || 0);
    variationMap.set(key, current);
  };

  for (const row of baselineVariationRows) {
    if (itemMap.has(row.item_id)) addVariation(row, 0);
  }
  for (const row of futureVariationRows) {
    const item = itemMap.get(row.item_id);
    if (!item) continue;
    const cycleIndex = restartCycleIndexForSession(item, row.session_start);
    if (cycleIndex > 0) addVariation(row, cycleIndex);
  }

  for (const variation of variationMap.values()) {
    variation.total = sumMetrics(variation.cycles);
    const listing = listingMap.get(variation.itemId);
    if (!listing) continue;
    const { itemId: _itemId, ...performance } = variation;
    void _itemId;
    listing.variations.push(performance);
  }

  const listings = [...listingMap.values()]
    .map((listing) => {
      listing.total = sumMetrics(listing.cycles);
      listing.progress = metricProgress(
        listing.cycles.map((cycle) => cycle.orders),
        listing.goals,
      );
      listing.cycleStatuses = cycleStatuses(
        listing.cycles.map((cycle) => cycle.orders),
        listing.goals,
      );
      Object.assign(listing, completionStreakSummary(listing.cycleStatuses));
      listing.variations.sort(
        (a, b) =>
          b.total.orders - a.total.orders ||
          a.variationTitle.localeCompare(b.variationTitle),
      );
      return listing;
    })
    .sort(
      (a, b) =>
        b.total.orders - a.total.orders ||
        a.listingTitle.localeCompare(b.listingTitle),
    );

  const cycles = Array.from({ length: 4 }, (_, index) => {
    const windows = restartItems.map((item) => restartWindows(item)[index]);
    const metric = sumMetrics(listings.map((listing) => listing.cycles[index]));
    return {
      cycle: index + 1,
      startDate: windows.map((window) => window.startDate).sort()[0] ?? "",
      endDate: windows.map((window) => window.endDate).sort().at(-1) ?? "",
      individualWindows: true,
      ...metric,
      sessions: cycleSessions[index].size,
      ctr: metric.impressions > 0 ? metric.clicks / metric.impressions : 0,
      cvr: metric.clicks > 0 ? metric.orders / metric.clicks : 0,
      aov: metric.orders > 0 ? metric.sales / metric.orders : 0,
    };
  });

  return { listings, cycles, totals: sumMetrics(cycles) };
}
