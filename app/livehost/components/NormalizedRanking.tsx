import { normalizePerformance } from "../lib/normalization";
import type { ParsedSession } from "../lib/report";

const rm = (value: number) => `RM${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function NormalizedRanking({ sessions, startDate, endDate }: {
  sessions: ParsedSession[]; startDate: string; endDate: string;
}) {
  const result = normalizePerformance(sessions, startDate, endDate);
  const unavailable = !sessions.length
    ? "Session records are required to calculate this ranking. Choose an uploaded report."
    : !result.sessionCount
      ? "No sessions in the selected date range."
      : "Both golden and normal periods need positive hours and GMV to calculate the timing multiplier.";
  return (
    <section className="section normalized-ranking" aria-labelledby="normalized-heading">
      <div className="section-heading">
        <p className="eyebrow">Host ranking · Method 2</p>
        <h2 id="normalized-heading">Timing-adjusted GMV/hour</h2>
        <p>Golden and normal periods use the same team multiplier for the selected report and dates.</p>
      </div>
      <dl className="normalization-baselines">
        <div><dt>Golden GMV/hour</dt><dd>{result.goldenRate === null ? "Unavailable" : rm(result.goldenRate)}</dd></div>
        <div><dt>Normal GMV/hour</dt><dd>{result.normalRate === null ? "Unavailable" : rm(result.normalRate)}</dd></div>
        <div><dt>Golden multiplier</dt><dd>{result.multiplier === null ? "Unavailable" : `${result.multiplier.toFixed(3)}x`}</dd></div>
      </dl>
      {result.multiplier === null ? <p className="normalization-note" role="status">{unavailable}</p> : null}
      {result.rows.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Timing-adjusted host ranking">
        <table>
          <thead><tr>
            <th scope="col">Rank</th><th scope="col">Host</th><th scope="col">Adjusted GMV/hr</th>
            <th scope="col">{startDate || endDate ? "Period viewer CVR" : "Monthly viewer CVR"}</th>
            <th scope="col">Raw GMV/hr</th><th scope="col">Rank change</th><th scope="col">Total hours</th>
            <th scope="col">Golden hours</th><th scope="col">Golden hours %</th>
            <th scope="col">Golden raw GMV</th><th scope="col">Golden raw GMV/hr</th>
            <th scope="col">Normal hours</th><th scope="col">Normal hours %</th>
            <th scope="col">Normal raw GMV</th><th scope="col">Normal raw GMV/hr</th>
            <th scope="col">Golden / normal sessions</th><th scope="col">Sample</th>
          </tr></thead>
          <tbody>{result.rows.map((h) => <tr key={h.name}>
            <td>{h.rank === null ? "—" : `#${h.rank}`}</td><th scope="row">{h.name}</th>
            <td><strong>{h.adjustedRate === null ? "Unavailable" : rm(h.adjustedRate)}</strong></td>
            <td>{h.viewerCvr === null ? "Unavailable" : `${h.viewerCvr.toFixed(2)}%`}</td>
            <td>{rm(h.rawRate)}</td><td>{h.rank === null ? "—" : h.rawRank - h.rank > 0 ? `+${h.rawRank - h.rank}` : h.rawRank - h.rank}</td>
            <td>{h.hours.toFixed(2)}</td>
            <td>{h.goldenHours.toFixed(2)}</td><td>{(h.goldenShare * 100).toFixed(1)}%</td>
            <td>{rm(h.goldenGmv)}</td><td>{h.goldenHours > 0 ? rm(h.goldenGmv / h.goldenHours) : "Unavailable"}</td>
            <td>{h.normalHours.toFixed(2)}</td><td>{(h.normalHours / h.hours * 100).toFixed(1)}%</td>
            <td>{rm(h.normalGmv)}</td><td>{h.normalHours > 0 ? rm(h.normalGmv / h.normalHours) : "Unavailable"}</td>
            <td>{h.goldenSessions} / {h.normalSessions}</td>
            <td>{[h.smallSample ? "Fewer than 5 in a period" : "", h.nearTie ? "Within RM0.01/hr of another host" : ""].filter(Boolean).join("; ") || "—"}</td>
          </tr>)}</tbody>
        </table>
      </div> : null}
      <p className="normalization-note">Viewer CVR = total confirmed orders ÷ total Viewers × 100 for the selected report and dates.
        Viewers is not impressions or product clicks; this rate is not adjusted for timing.</p>
      <p className="normalization-note">Adjusted GMV/hour = (golden GMV ÷ golden multiplier + normal GMV) ÷ total hours.
        Multiplier = team golden GMV/hour ÷ team normal GMV/hour.</p>
      <p className="normalization-note">Whole sessions are grouped by start time: 12–2pm and 8pm–12am are golden.
        Golden and normal hours are whole-session hours in each group; their shares use total host hours.
        Raw GMV is confirmed sales before timing adjustment, and each period's raw GMV/hour uses its own hours.
        Confirmed campaign dates: 7, 15 and 25 July. Other months have no confirmed campaign dates configured.
        {result.crossBoundary > 0 ? ` ${result.crossBoundary} sessions cross a timing boundary; hourly sales are unavailable.` : ""}</p>
      <p className="normalization-note">Baselines include each host. This adjusts observed timing differences, not voucher, product or advertising effects.
        Fewer than 5 sessions is a review flag, not a confidence test. Positive rank change means moving up from the raw ranking.
        {result.excluded > 0 ? ` ${result.excluded} unclear or invalid sessions excluded from this ranking and its baselines.` : ""}</p>
    </section>
  );
}
