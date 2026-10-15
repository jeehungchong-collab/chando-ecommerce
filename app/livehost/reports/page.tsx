import Link from "next/link";
import { loadReportArchive } from "../lib/report";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monthly Reports | CHANDO" };

export default async function MonthlyReports() {
  const reports = await loadReportArchive();
  return <>
    <nav className="topbar" aria-label="Report navigation">
      <Link href="/livehost">Dashboard</Link><Link href="/livehost/reports" aria-current="page">Monthly reports</Link><Link href="/livehost/upload">Upload Report</Link>
    </nav>
    <main>
      <section className="section">
        <p className="eyebrow">CHANDO Shopee</p><h2>Monthly reports</h2>
        <div className="table-wrap"><table><thead><tr><th>Month</th><th>Date range</th><th>Sessions</th><th>Confirmed GMV</th><th>Orders</th><th>Updated</th></tr></thead>
          <tbody>{reports.map(({ month, report, uploadedAt }) => <tr key={month}>
            <td><Link href={`/livehost/reports/${month}`}>{month}</Link></td><td>{report.summary.dateRange}</td>
            <td>{report.summary.rowCount}</td><td>RM{report.summary.totalGmv.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>{report.summary.totalOrders}</td><td>{uploadedAt ? new Date(uploadedAt).toLocaleDateString("en-MY") : "Restored from original exports"}</td>
          </tr>)}</tbody></table></div>
      </section>
    </main>
  </>;
}
