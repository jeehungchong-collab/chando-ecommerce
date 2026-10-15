"use client";

import { useEffect, useMemo, useState } from "react";
import { datesInWindow } from "@/lib/calculations";
import AdminClient, { type AdminClientProps } from "./admin/admin-client";
import PlatformNav from "./platform-nav";
import type {
  DashboardData,
  ListingPerformance,
  MetricTotals,
} from "@/lib/types";

function money(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(value);
}

function integer(value: number) {
  return new Intl.NumberFormat("en-MY", {
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T00:00:00Z`));
}

function cycleLabel(startDate: string, endDate: string) {
  return datesInWindow(startDate, endDate).map(shortDate).join(", ");
}

function timeOnly(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(`${value.replace(" ", "T")}:00+08:00`));
}

function sessionLabel(startDate: string, endDate: string) {
  const startDay = startDate.slice(0, 10);
  const endDay = endDate.slice(0, 10);
  const dateLabel =
    startDay === endDay || endDate.endsWith("00:00")
      ? shortDate(startDay)
      : `${shortDate(startDay)}, ${shortDate(endDay)}`;
  return `${dateLabel} · ${timeOnly(startDate)}–${timeOnly(endDate)}`;
}

function campaignAnchor(slug: string) {
  return `campaign-${slug}`;
}

function SalesCountCell({
  metric,
  goal,
  status,
  streak,
  completed,
}: {
  metric: MetricTotals;
  goal: number | null;
  status: ListingPerformance["cycleStatuses"][number];
  streak: number;
  completed: boolean;
}) {
  const statusLabel =
    status === "baseline"
      ? "baseline"
      : status === "recovered"
        ? "recovered"
        : status === "pass"
          ? "pass"
          : status === "fail" && completed
            ? "fail"
            : goal
              ? `goal ${integer(goal)}`
              : "waiting";
  const streakLabel =
    status === "baseline" || status === "pass" || status === "recovered"
      ? `${Math.min(streak, 4)}/4 streak`
      : null;
  return (
    <div className={`metric-cell sales-count-cell cycle-status-${status}`}>
      <div className="metric-line">
        <strong>{integer(metric.orders)}</strong>
        <span className="cell-caption">{integer(metric.units)} units</span>
      </div>
      <span className="cell-caption">{statusLabel}</span>
      {streakLabel && <span className="streak-caption">{streakLabel}</span>}
      <span className="cycle-sales">{money(metric.sales)}</span>
    </div>
  );
}

function ListingRow({
  listing,
  expanded,
  onToggle,
  failedCycles = [],
  cycles,
  visibleCycles,
  asOf,
}: {
  listing: ListingPerformance;
  expanded: boolean;
  onToggle: () => void;
  failedCycles?: number[];
  cycles: DashboardData["cycles"];
  visibleCycles: DashboardData["cycles"];
  asOf: string;
}) {
  const hasFailure = failedCycles.length > 0;
  const streaks = successStreaksFromStatuses(listing.cycleStatuses);
  return (
    <>
      <tr
        className={`listing-row ${hasFailure ? "failed-listing" : ""} ${
          listing.doneComplete ? "done-complete-listing" : ""
        }`}
      >
        <td className="product-column">
          <button
            className="expand-button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} variations for ${listing.listingTitle}`}
          >
            <span className={expanded ? "chevron open" : "chevron"}>›</span>
          </button>
          <div>
            <span className="id-label">ITEM {listing.itemId}</span>
            <strong>{listing.listingTitle}</strong>
            <span className="variation-count">
              {listing.variations.length} variations
            </span>
            {hasFailure && (
              <div className="listing-alerts">
                <span className="failure-badge">
                  Failed {failedCycles.map((cycle) => `C${cycle}`).join(", ")}
                </span>
              </div>
            )}
            {listing.cycleStatuses.includes("recovered") && (
              <div className="listing-alerts">
                <span className="recovered-badge">
                  Streak restarted in{" "}
                  {listing.cycleStatuses
                    .map((status, index) =>
                      status === "recovered" ? `C${index + 1}` : null,
                    )
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
            )}
            <div className="listing-alerts">
              <span
                className={
                  listing.readyToComplete ? "ready-badge" : "streak-badge"
                }
              >
                {listing.readyToComplete
                  ? "Ready: 4-cycle streak hit"
                  : `Current streak ${listing.successStreak}/4 · best ${listing.longestSuccessStreak}/4`}
              </span>
              {listing.activeBaselineCycle && listing.activeBaselineOrders ? (
                <span className="baseline-badge">
                  {listing.selectedPathStatus === "complete"
                    ? "Complete"
                    : listing.selectedPathStatus === "failed"
                      ? "Failed path"
                      : "Active path"}{" "}
                  C{listing.activeBaselineCycle}:{" "}
                  baseline {integer(listing.activeBaselineOrders)}
                </span>
              ) : null}
            </div>
            {listing.doneComplete && (
              <div className="listing-alerts">
                <span className="done-badge">Done complete</span>
              </div>
            )}
            {listing.cycleWindows && listing.baselineSession && (
              <div className="restart-dates">
                <span>
                  Baseline session: {sessionLabel(
                    listing.baselineSession.startDate,
                    listing.baselineSession.endDate,
                  )}
                </span>
                {listing.cycleWindows.map((window) => (
                  <span key={window.cycle}>
                    C{window.cycle}: {cycleLabel(window.startDate, window.endDate)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </td>
        {visibleCycles.map((cycle) => {
          const index = cycle.cycle - 1;
          const metric = listing.cycles[index];
          return (
            <td key={cycle.cycle}>
              <SalesCountCell
                metric={metric}
                goal={listing.goals[index]}
                status={listing.cycleStatuses[index]}
                streak={streaks[index] ?? 0}
                completed={`${cycles[index]?.endDate ?? ""} 00:00` <= asOf}
              />
            </td>
          );
        })}
        <td className="number-cell">
          <strong>{integer(listing.total.orders)}</strong>
          <span>{integer(listing.total.units)} units</span>
        </td>
        <td className="number-cell sales-cell">
          <strong>{money(listing.total.sales)}</strong>
        </td>
      </tr>
      {expanded &&
        listing.variations.map((variation) => (
          <tr className="variation-row" key={variation.variationId}>
            <td className="product-column variation-product">
              <span className="branch-mark">↳</span>
              <div>
                <strong>{variation.variationTitle}</strong>
                <span className="sku-label">{variation.sku || "No SKU"}</span>
                <span className="id-label">VAR {variation.variationId}</span>
              </div>
            </td>
            {visibleCycles.map((cycle) => {
              const metric = variation.cycles[cycle.cycle - 1];
              return (
                <td className="variation-metric" key={cycle.cycle}>
                  <strong>{integer(metric.orders)}</strong>
                  <span>{money(metric.sales)}</span>
                </td>
              );
            })}
            <td className="number-cell">
              <strong>{integer(variation.total.orders)}</strong>
              <span>{integer(variation.total.units)} units</span>
            </td>
            <td className="number-cell">
              <strong>{money(variation.total.sales)}</strong>
            </td>
          </tr>
        ))}
    </>
  );
}

function successStreaksFromStatuses(
  statuses: ListingPerformance["cycleStatuses"],
) {
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

function CombinedTracker({
  data,
  asOf,
}: {
  data: DashboardData;
  asOf: string;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [showAllPulseCycles, setShowAllPulseCycles] = useState(false);
  const [showCompletedListings, setShowCompletedListings] = useState(false);
  const recentCycles = useMemo(
    () => [...data.cycles].sort((a, b) => b.cycle - a.cycle),
    [data.cycles],
  );
  const pulseCycles = showAllPulseCycles ? recentCycles : recentCycles.slice(0, 4);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data.listings;
    return data.listings.filter(
      (listing) =>
        listing.itemId.includes(needle) ||
        listing.listingTitle.toLowerCase().includes(needle) ||
        listing.variations.some(
          (variation) =>
            variation.variationId.includes(needle) ||
            variation.variationTitle.toLowerCase().includes(needle) ||
            variation.sku.toLowerCase().includes(needle),
        ),
    );
  }, [data.listings, query]);
  const activeFiltered = filtered.filter((listing) => !listing.doneComplete);
  const completedFiltered = filtered.filter((listing) => listing.doneComplete);
  const completedVisible = showCompletedListings || query.trim().length > 0;
  const displayedListings = completedVisible
    ? [...activeFiltered, ...completedFiltered]
    : activeFiltered;

  const lastUpload = data.uploads.find((upload) => upload.active);
  const listingFailures = new Map(
    data.listings.map((listing) => {
      if (listing.readyToComplete || listing.doneComplete) {
        return [listing.itemId, []] as const;
      }
      const unresolved: number[] = [];
      data.cycles
        .filter((cycle) => `${cycle.endDate} 00:00` <= asOf)
        .forEach((cycle) => {
          const status = listing.cycleStatuses[cycle.cycle - 1];
          if (status === "fail") unresolved.push(cycle.cycle);
          if (status === "baseline" || status === "pass" || status === "recovered") {
            unresolved.length = 0;
          }
        });
      return [listing.itemId, unresolved] as const;
    }),
  );
  const failedListingCount = [...listingFailures.values()].filter(
    (cycles) => cycles.length > 0,
  ).length;
  const readyListingCount = data.listings.filter(
    (listing) => listing.readyToComplete && !listing.doneComplete,
  ).length;

  function toggle(itemId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  return (
    <article
      className="campaign-lane original-lane"
      id={campaignAnchor(data.campaign.slug)}
    >
      <header className="campaign-lane-header">
        <div>
          <span className="campaign-type">One combined tracker · continuous 3-day cycles</span>
          <h2>{data.campaign.name}</h2>
          <p>
            Every uploaded Flash Sale session rolls into the same timeline. New
            listings are added in the cycle where they first sell, with earlier
            cycles shown as zero.
          </p>
        </div>
        <div className="campaign-lane-actions">
          <span>
            {readyListingCount} ready · {failedListingCount} active fail streaks · {cycleLabel(
              data.campaign.startDate,
              data.cycles[data.cycles.length - 1]?.endDate ??
                data.campaign.startDate,
            )}
          </span>
          <a
            className="primary-button"
            href="/api/shopee/export"
          >
            Export tracker
          </a>
        </div>
      </header>

      <section className="kpi-grid campaign-kpi-grid" aria-label={`${data.campaign.name} totals`}>
        <article className="kpi-card featured">
          <span className="kpi-icon">↑</span>
          <div>
            <span>Confirmed orders</span>
            <strong>{integer(data.totals.orders)}</strong>
            <small>{integer(data.totals.units)} units sold</small>
          </div>
        </article>
        <article className="kpi-card">
          <span>Confirmed sales</span>
          <strong>{money(data.totals.sales)}</strong>
          <small>
            AOV{" "}
            {money(
              data.totals.orders > 0
                ? data.totals.sales / data.totals.orders
                : 0,
            )}
          </small>
        </article>
        <article className="kpi-card">
          <span>Tracked catalogue</span>
          <strong>{integer(data.listings.length)}</strong>
          <small>
            {integer(
              data.listings.reduce(
                (count, listing) => count + listing.variations.length,
                0,
              ),
            )}{" "}
            variations
          </small>
        </article>
        <article className="kpi-card">
          <span>Ready to complete</span>
          <strong>{integer(readyListingCount)}</strong>
          <small>needs 4 consecutive successful cycles</small>
        </article>
      </section>

      <section className="section-block campaign-cycle-block">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Cycle pulse</span>
            <h2>How each 3-day window is moving</h2>
          </div>
          <div className="cycle-pulse-actions">
            <p>Start date is included; the next cycle date is excluded.</p>
            {recentCycles.length > 4 && (
              <button
                className="text-button"
                onClick={() => setShowAllPulseCycles((current) => !current)}
              >
                {showAllPulseCycles
                  ? "Collapse older cycles"
                  : `Show older cycles (${recentCycles.length - 4})`}
              </button>
            )}
          </div>
        </div>
        <div className="cycle-grid">
          {pulseCycles.map((cycle) => (
            <article className="cycle-card" key={cycle.cycle}>
              <div className="cycle-card-head">
                <span>Cycle {cycle.cycle}</span>
                <small>
                  {cycle.individualWindows
                    ? "Individual listing windows"
                    : cycleLabel(cycle.startDate, cycle.endDate)}
                </small>
              </div>
              <strong>{integer(cycle.orders)} orders</strong>
              <div className="cycle-substats">
                <span>
                  <b>{money(cycle.sales)}</b> sales
                </span>
                <span>
                  <b>{cycle.sessions}</b> sessions
                </span>
              </div>
              <div className="mini-metrics">
                <span>
                  CTR <b>{percent(cycle.ctr)}</b>
                </span>
                <span>
                  CVR <b>{percent(cycle.cvr)}</b>
                </span>
                <span>
                  AOV <b>{money(cycle.aov)}</b>
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block tracker-section campaign-tracker-section">
        <div className="section-heading tracker-heading">
          <div>
            <span className="section-kicker">Product perspective</span>
            <h2>Listing sales count and SKU contribution</h2>
          </div>
          <div className="table-tools">
            <label className="search-field">
              <span>⌕</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find listing, variation, SKU or ID"
              />
            </label>
            <button
              className="text-button"
              onClick={() =>
                setExpanded(
                  expanded.size
                    ? new Set()
                    : new Set(displayedListings.map((listing) => listing.itemId)),
                )
              }
            >
              {expanded.size ? "Collapse all" : "Expand all"}
            </button>
          </div>
        </div>
        <div className="goal-rule">
          <span>4×</span>
          <p>
            A listing is ready only after 4 consecutive successful cycles. If
            momentum restarts after a fail, the next non-zero cycle becomes a
            fresh baseline automatically. Flash PMS is not imported,
            calculated, or displayed.
          </p>
        </div>
        <div className="failure-legend">
          <span className="failure-legend-swatch" />
          <p>
            Coral rows had at least one completed cycle with zero orders. They
            stay visible in the combined list so new and paused listings are easy
            to compare.
          </p>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th className="product-column">Listing / variation</th>
                {recentCycles.map((cycle) => (
                  <th key={cycle.cycle}>
                    Cycle {cycle.cycle}
                    <span>
                      {cycle.individualWindows
                        ? "See listing dates"
                        : cycleLabel(cycle.startDate, cycle.endDate)}
                    </span>
                  </th>
                ))}
                <th>Total</th>
                <th>Sales</th>
              </tr>
            </thead>
            <tbody>
              {activeFiltered.map((listing) => (
                <ListingRow
                  listing={listing}
                  expanded={expanded.has(listing.itemId)}
                  onToggle={() => toggle(listing.itemId)}
                  failedCycles={listingFailures.get(listing.itemId)}
                  cycles={data.cycles}
                  visibleCycles={recentCycles}
                  asOf={asOf}
                  key={listing.itemId}
                />
              ))}
              {completedFiltered.length > 0 && (
                <tr className="completed-listings-toggle-row">
                  <td colSpan={recentCycles.length + 3}>
                    <button
                      className="completed-listings-toggle"
                      type="button"
                      onClick={() => setShowCompletedListings((current) => !current)}
                      aria-expanded={completedVisible}
                    >
                      <span>
                        <strong>Done complete</strong>
                        <small>{completedFiltered.length} listings</small>
                      </span>
                      <span>{completedVisible ? "Collapse completed" : "Show completed"}</span>
                    </button>
                  </td>
                </tr>
              )}
              {completedVisible &&
                completedFiltered.map((listing) => (
                  <ListingRow
                    listing={listing}
                    expanded={expanded.has(listing.itemId)}
                    onToggle={() => toggle(listing.itemId)}
                    failedCycles={listingFailures.get(listing.itemId)}
                    cycles={data.cycles}
                    visibleCycles={recentCycles}
                    asOf={asOf}
                    key={listing.itemId}
                  />
                ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="empty-state">
              No listing or variation matches “{query}”.
            </div>
          )}
        </div>
      </section>

      <section className="insight-strip campaign-insight-strip">
        <div>
          <span>Traffic</span>
          <strong>{integer(data.totals.impressions)}</strong>
          <small>product impressions</small>
        </div>
        <div>
          <span>Engagement</span>
          <strong>{integer(data.totals.clicks)}</strong>
          <small>{percent(data.totals.clicks / Math.max(data.totals.impressions, 1))} CTR</small>
        </div>
        <div>
          <span>Conversion</span>
          <strong>
            {percent(data.totals.orders / Math.max(data.totals.clicks, 1))}
          </strong>
          <small>orders ÷ clicks</small>
        </div>
        <div>
          <span>Latest active source</span>
          <strong className="source-name">
            {lastUpload?.sourceFile ?? "No source uploaded"}
          </strong>
          <small>
            {lastUpload
              ? `${lastUpload.sessionStart} · revision ${lastUpload.revision}`
              : "Use the admin workspace to begin"}
          </small>
        </div>
      </section>
    </article>
  );
}

export default function DashboardClient({
  dashboard,
  asOf,
  admin,
}: {
  dashboard: DashboardData;
  asOf: string;
  admin: Omit<AdminClientProps, "embedded"> | null;
}) {
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => unknown } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(context.registerTool({
        name: "read_shopee_team_summary",
        description: "Read the current independent Shopee team tracker totals without changing data.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input: unknown) {
          if (!input || typeof input !== "object" || Object.keys(input).length) throw new Error("Expected an empty object.");
          return { totals: dashboard.totals, listings: dashboard.listings.length };
        },
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Optional browser capability. */ }
    return () => lifecycle.abort();
  }, [dashboard]);
  return (
    <main>
      <PlatformNav active="shopee" />
      <header className="site-header">
        <a className="brand-lockup" href="/">
          <span className="brand-mark">CH</span>
          <span>
            <strong>CHANDO</strong>
            <small>Himalaya Malaysia</small>
          </span>
        </a>
        <nav className="header-actions" aria-label="Dashboard actions">
          <a className="ghost-button" href={admin ? "#admin-workspace" : "/admin"}>
            Admin workspace
          </a>
        </nav>
      </header>

      <section className="hero-section combined-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="live-dot" />
            Confirmed Order basis
            <span className="eyebrow-divider" />
            Flash PMS excluded
          </div>
          <h1>Shopee Team Tracker. Continuous Flash Sale cycles.</h1>
          <p>Jinhui’s team workspace · Independent uploads and data. Your original tracker is unchanged.</p>
          <p>
            Every listing and variation is rolled into the same 3-day rhythm,
            starting from 24 Jul 2026. New listings appear automatically in the
            cycle where they first sell.
          </p>
        </div>
        <nav className="campaign-jump-grid" aria-label="Jump to campaign">
          <a
            className="jump-card original"
            href={`#${campaignAnchor(dashboard.campaign.slug)}`}
          >
            <span>Combined tracker</span>
            <strong>{dashboard.cycles.length} cycles</strong>
            <small>{dashboard.listings.length} listings · {integer(dashboard.totals.orders)} tracked orders</small>
          </a>
          <a className="jump-card restart" href="/api/shopee/export">
            <span>Download</span>
            <strong>Excel tracker</strong>
            <small>Listing rows, SKU rows, orders and sales</small>
          </a>
        </nav>
      </section>

      <section className="campaign-stack" aria-label="Campaign dashboards">
        <CombinedTracker data={dashboard} asOf={asOf} />
      </section>

      {admin && <AdminClient {...admin} embedded />}

      <footer>
        <span>CHANDO Flash Sale Cycle Tracker</span>
        <span>One combined view · Confirmed orders only · Asia/Kuala Lumpur</span>
      </footer>
    </main>
  );
}
