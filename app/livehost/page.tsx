import Link from "next/link";
import { ReportDashboard } from "./components/ReportDashboard";
import { loadReportArchive, loadUploadHistory } from "./lib/report";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [reports, uploadHistory] = await Promise.all([loadReportArchive(), loadUploadHistory()]);

  return (
    <>
      <div className="topbar">
        <Link href="/livehost" aria-current="page">
          Dashboard
        </Link>
        <Link href="/livehost/upload">Upload Report</Link>
        <Link href="/livehost/reports">Monthly reports</Link>
      </div>
      <ReportDashboard reports={reports} uploadHistory={uploadHistory} />
    </>
  );
}
