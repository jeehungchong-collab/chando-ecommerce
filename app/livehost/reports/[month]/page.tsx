import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportDashboard } from "../../components/ReportDashboard";
import { loadReportArchive } from "../../lib/report";
import { validMonth } from "../../lib/months";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monthly Livehost Report | CHANDO" };

export default async function MonthlyReport({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  if (!validMonth(month)) notFound();
  const reports = await loadReportArchive();
  const selected = reports.find((item) => item.month === month);
  if (!selected) notFound();
  return (
    <>
      <nav className="topbar" aria-label="Report navigation">
        <Link href="/livehost">Dashboard</Link>
        <Link href="/livehost/reports">Monthly reports</Link>
        <Link href="/livehost/upload">Upload Report</Link>
      </nav>
      <ReportDashboard reports={[selected]} uploadHistory={[]} showUploadHistory={false} />
    </>
  );
}
