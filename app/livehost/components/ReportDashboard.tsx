"use client";

import { useMemo, useState } from "react";
import { NormalizedRanking } from "./NormalizedRanking";
import type { HostReport, LivehostReport, ParsedSession, ReportArchiveItem, UploadHistoryItem } from "../lib/report";

type MetricBucket = {
  sessions: number;
  hours: number;
  gmv: number;
  orders: number;
  views: number;
  atc: number;
  peakHours: number;
};

const timingOrder: [string, string, string][] = [
  ["Campaign peak date", "Campaign dates", "7/7, 15/7, 25/7"],
  ["Late night peak start", "Late night peak", "10pm-12am"],
  ["Night peak start", "Night peak", "8-10pm"],
  ["Noon peak start", "Noon peak", "12-2pm"],
  ["Off-peak start", "Off-peak", "Other slots"],
];

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

function money(value: number) {
  return `RM${value.toLocaleString("en-MY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function money2(value: number) {
  return `RM${value.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function ReportDashboard({
  reports,
  uploadHistory,
  showUploadHistory = true,
}: {
  reports: ReportArchiveItem[];
  uploadHistory: UploadHistoryItem[];
  showUploadHistory?: boolean;
}) {
  const [selectedReportId, setSelectedReportId] = useState(reports[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const selectedArchive = reports.find((item) => item.id === selectedReportId) ?? reports[0];
  const report = selectedArchive?.report;
  const sessions = useMemo(() => report.sessions ?? [], [report.sessions]);
  const bounds = useMemo(() => dateBounds(sessions), [sessions]);
  const visibleReport = useMemo(
    () => filterReport(report, startDate, endDate),
    [report, startDate, endDate],
  );
  const totalGmv = visibleReport.summary.totalGmv;
  const totalOrders = visibleReport.summary.totalOrders;
  const totalViews = visibleReport.summary.totalViews;
  const totalHours = visibleReport.hosts.reduce((sum, host) => sum + host.hours, 0);
  const maxGmvHour = Math.max(...visibleReport.hosts.map((host) => host.gmvHour), 1);
  const maxTiming = Math.max(...visibleReport.timing.map((slot) => slot.gmvHour), 1);
  const hasSessionRows = sessions.length > 0;

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">CHANDO Shopee Livehost Report</p>
          <h1>{visibleReport.title}</h1>
          <p className="lede">{visibleReport.subtitle}</p>
          <div className="report-meta">
            <span>Date range: {visibleReport.summary.dateRange}</span>
            <span>Rows: {visibleReport.summary.rowCount.toLocaleString("en-MY")}</span>
            <span>Unclear rows: {visibleReport.summary.unclearRows}</span>
            {report.generatedAt ? <span>Updated: {new Date(report.generatedAt).toLocaleString("en-MY")}</span> : null}
          </div>
        </div>
        <div className="hero-metrics" aria-label="headline metrics">
          <div>
            <span>Total confirmed GMV</span>
            <strong>{money2(totalGmv)}</strong>
          </div>
          <div>
            <span>Confirmed orders</span>
            <strong>{totalOrders.toLocaleString("en-MY")}</strong>
          </div>
          <div>
            <span>Views / impressions</span>
            <strong>{totalViews.toLocaleString("en-MY")}</strong>
          </div>
          <div>
            <span>Team GMV/hour</span>
            <strong>{money(ratio(totalGmv, totalHours))}</strong>
          </div>
          <div>
            <span>Conversion rate</span>
            <strong>{(ratio(totalOrders, totalViews) * 100).toFixed(2)}%</strong>
          </div>
        </div>
      </section>

      <section className="section dashboard-controls">
        <div className="section-heading">
          <p className="eyebrow">Dashboard Data Range</p>
          <h2>Choose report and period</h2>
          <p>
            Switch between uploaded months, then filter the selected report by date. The dashboard
            recalculates GMV, hours, conversion, timing breakdown, and host ranking.
          </p>
        </div>
        <div className="date-range-fields dashboard-report-controls">
          <label className="report-picker">
            <span>Report</span>
            <select
              value={selectedReportId}
              onChange={(event) => {
                setSelectedReportId(event.target.value);
                setStartDate("");
                setEndDate("");
              }}
            >
              {reports.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Start date</span>
            <input
              type="date"
              min={bounds.min}
              max={bounds.max}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label>
            <span>End date</span>
            <input
              type="date"
              min={bounds.min}
              max={bounds.max}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!startDate && !endDate}
            onClick={() => {
              setStartDate("");
              setEndDate("");
            }}
          >
            Reset
          </button>
          <p>
            {hasSessionRows
              ? `Available uploaded range: ${bounds.min} to ${bounds.max}.`
              : "This saved baseline has monthly totals only; choose an uploaded report for day-range recalculation."}
          </p>
        </div>
      </section>

      <section className="section timing-section">
        <div className="section-heading">
          <p className="eyebrow">Expanded Peak Timing Check</p>
          <h2>Performance by time period</h2>
          <p>
            Peak includes 7/7, 15/7, 25/7, daily 10pm-12am, 8-10pm, and 12-2pm.
            Campaign dates are separated first to avoid double-counting.
          </p>
          <p className="metric-note">
            Shopee export provides `Viewers`; this dashboard uses that field as the traffic count
            for views / impressions.
          </p>
        </div>
        <div className="timing-grid expanded">
          {visibleReport.timing.map((slot) => (
            <article className="timing-card" key={slot.label}>
              <div className="timing-title">
                <span>{slot.label}</span>
                <strong>{slot.window}</strong>
              </div>
              <div className="bar-track" aria-label={`${slot.label} GMV per hour ${slot.gmvHour}`}>
                <div style={{ width: `${(slot.gmvHour / maxTiming) * 100}%` }} />
              </div>
              <dl>
                <div>
                  <dt>GMV/hour</dt>
                  <dd>{money(slot.gmvHour)}</dd>
                </div>
                <div>
                  <dt>CVR</dt>
                  <dd>{slot.viewerCvr.toFixed(2)}%</dd>
                </div>
                <div>
                  <dt>Views</dt>
                  <dd>{slot.views.toLocaleString("en-MY")}</dd>
                </div>
                <div>
                  <dt>Orders</dt>
                  <dd>{slot.orders}</dd>
                </div>
                <div>
                  <dt>Sessions</dt>
                  <dd>{slot.sessions}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <p className="eyebrow">Raw Performance</p>
          <h2>GMV/hour before timing adjustment</h2>
        </div>
        <div className="host-grid">
          {visibleReport.hosts.map((host, index) => (
            <article className="host-card" key={host.name}>
              <div className="host-topline">
                <div>
                  <span>#{index + 1}</span>
                  <h3>{host.name}</h3>
                </div>
                <strong>{money(host.gmvHour)}/hr</strong>
              </div>
              <div className="bar-track compact">
                <div style={{ width: `${(host.gmvHour / maxGmvHour) * 100}%` }} />
              </div>
              <div className="host-stats">
                <div>
                  <span>GMV</span>
                  <strong>{money(host.gmv)}</strong>
                </div>
                <div>
                  <span>Orders</span>
                  <strong>{host.orders}</strong>
                </div>
                <div>
                  <span>Views</span>
                  <strong>{host.views.toLocaleString("en-MY")}</strong>
                </div>
                <div>
                  <span>Viewer CVR</span>
                  <strong>{host.viewerCvr.toFixed(2)}%</strong>
                </div>
                <div>
                  <span>Cost ROI</span>
                  <strong>{host.costRoi.toFixed(2)}x</strong>
                </div>
              </div>
              <p>{host.read}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section table-section">
        <div className="section-heading">
          <p className="eyebrow">Timing By Host</p>
          <h2>Who depends on good slots?</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Host</th>
                <th>Hours</th>
                <th>Views</th>
                <th>Peak hour share</th>
                <th>Campaign GMV/hr</th>
                <th>10pm-12am GMV/hr</th>
                <th>8-10pm GMV/hr</th>
                <th>12-2pm GMV/hr</th>
                <th>Off-peak GMV/hr</th>
              </tr>
            </thead>
            <tbody>
              {visibleReport.hosts.map((host) => (
                <tr key={host.name}>
                  <td>{host.name}</td>
                  <td>{host.hours.toFixed(2)}</td>
                  <td>{host.views.toLocaleString("en-MY")}</td>
                  <td>{host.peakShare.toFixed(1)}%</td>
                  <td>{host.campaign ? money(host.campaign) : "-"}</td>
                  <td>{host.late ? money(host.late) : "-"}</td>
                  <td>{host.night ? money(host.night) : "-"}</td>
                  <td>{host.noon ? money(host.noon) : "-"}</td>
                  <td>{money(host.offPeak)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="normalization-note">
          Peak hour share = total live hours overlapping peak periods ÷ total live hours × 100,
          summed across the host&apos;s sessions in the selected report and dates.
          Daily peak periods are 12–2pm and 8pm–12am, in Malaysia time.
          For example, a 7–9pm session has 1 peak hour out of 2 total hours: 50%.
        </p>
        <p className="normalization-note">
          Sessions starting on 7, 15 or 25 July count entirely as campaign peak hours;
          they are not counted again in daily windows. Other months currently use daily windows only.
          This share counts overlapping hours, while Method 2&apos;s golden hours % groups whole sessions by start time.
        </p>
      </section>

      <NormalizedRanking sessions={sessions} startDate={startDate} endDate={endDate} />

      <section className="section recommendations">
        <div className="section-heading">
          <p className="eyebrow">Next Month Schedule</p>
          <h2>Recommended allocation</h2>
        </div>
        <div className="recommendation-list">
          {visibleReport.recommendations.map(([title, people, reason]) => (
            <article key={title}>
              <span>{title}</span>
              <strong>{people}</strong>
              <p>{reason}</p>
            </article>
          ))}
        </div>
      </section>

      {visibleReport.unclearRows.length ? (
        <section className="section table-section">
          <div className="section-heading">
            <p className="eyebrow">Needs Review</p>
            <h2>Unclear host rows</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Row</th>
                  <th>Start Time</th>
                  <th>Livestream Name</th>
                  <th>GMV</th>
                  <th>Orders</th>
                </tr>
              </thead>
              <tbody>
                {visibleReport.unclearRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.fileName}</td>
                    <td>{row.rowNumber}</td>
                    <td>{row.startTime}</td>
                    <td>{row.livestreamName}</td>
                    <td>{money(row.gmv)}</td>
                    <td>{row.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showUploadHistory ? <section className="section table-section upload-history-section">
        <div className="section-heading">
          <p className="eyebrow">Upload History</p>
          <h2>Latest report uploads</h2>
          <p>Shows the update date, uploaded file names, and the signed-in uploader email.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Uploader email</th>
                <th>File name</th>
                <th>Rows</th>
                <th>Range</th>
                <th>GMV</th>
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              {uploadHistory.length ? (
                uploadHistory.flatMap((item) =>
                  item.fileNames.map((fileName, index) => (
                    <tr key={`${item.id}-${fileName}-${index}`}>
                      {index === 0 ? (
                        <>
                          <td rowSpan={Math.max(item.fileNames.length, 1)}>{new Date(item.uploadedAt).toLocaleString("en-MY")}</td>
                          <td rowSpan={Math.max(item.fileNames.length, 1)}>{item.uploadedByEmail}</td>
                        </>
                      ) : null}
                      <td>{fileName}</td>
                      {index === 0 ? (
                        <>
                          <td rowSpan={Math.max(item.fileNames.length, 1)}>{item.rowCount.toLocaleString("en-MY")}</td>
                          <td rowSpan={Math.max(item.fileNames.length, 1)}>{item.dateRange}</td>
                          <td rowSpan={Math.max(item.fileNames.length, 1)}>{money2(item.totalGmv)}</td>
                          <td rowSpan={Math.max(item.fileNames.length, 1)}>{item.totalOrders.toLocaleString("en-MY")}</td>
                        </>
                      ) : null}
                    </tr>
                  )),
                )
              ) : (
                <tr>
                  <td colSpan={7}>No upload history yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section> : null}
    </main>
  );
}

function filterReport(report: LivehostReport, startDate: string, endDate: string): LivehostReport {
  const sessions = report.sessions ?? [];
  if (!sessions.length || (!startDate && !endDate)) return report;
  const filtered = sessions.filter((session) => {
    if (startDate && session.date < startDate) return false;
    if (endDate && session.date > endDate) return false;
    return true;
  });
  return buildReportFromSessions(report, filtered, startDate, endDate);
}

function buildReportFromSessions(baseReport: LivehostReport, sessions: ParsedSession[], startDate: string, endDate: string): LivehostReport {
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
    ...baseReport,
    summary: {
      ...baseReport.summary,
      rowCount: sessions.length,
      dateRange: dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : `No rows for ${startDate || "first date"} to ${endDate || "last date"}`,
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
  };
}

function makeHostReport(host: string, data: MetricBucket = blankMetrics(), timingMap: Map<string, MetricBucket> = new Map()): HostReport {
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
  bucket.peakHours += session.peakHours;
}

function timingGmvHour(timingMap: Map<string, MetricBucket>, slot: string) {
  const timing = timingMap.get(slot) ?? blankMetrics();
  return round0(ratio(timing.gmv, timing.hours));
}

function blankMetrics(): MetricBucket {
  return { sessions: 0, hours: 0, gmv: 0, orders: 0, views: 0, atc: 0, peakHours: 0 };
}

function dateBounds(sessions: ParsedSession[]) {
  const dates = sessions.map((session) => session.date).sort();
  return { min: dates[0] ?? "", max: dates[dates.length - 1] ?? "" };
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
