import Link from "next/link";
import { chatGPTSignOutPath, requireChatGPTUser } from "@/app/chatgpt-auth";
import { isWorkspaceOwner } from "@/lib/admin";
import { UploadPortal } from "./upload-portal";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const user = await requireChatGPTUser("/livehost/upload");
  const allowed = isWorkspaceOwner(user.email);

  return (
    <>
      <div className="topbar">
        <Link href="/livehost">Dashboard</Link>
        <Link href="/livehost/upload" aria-current="page">
          Upload Report
        </Link>
      </div>
      <main className="upload-main">
        <section className="upload-hero">
          <p className="eyebrow">Protected Upload</p>
          <h1>Update Livehost Report</h1>
          <p className="lede">
            Upload Shopee livestream export CSV or XLSX files. The site previews totals first and
            only replaces the public dashboard after you confirm.
          </p>
          <div className="report-meta">
            <span>Signed in: {user.email}</span>
            <span>Role: Owner · Livehost uploader</span>
            <a href={chatGPTSignOutPath("/livehost")} className="signout">
              Sign out
            </a>
          </div>
        </section>

        {allowed ? (
          <UploadPortal />
        ) : (
          <section className="upload-panel error-panel">
            <h2>This account cannot upload</h2>
            <p>
              Livehost uploads and original-file downloads are restricted to the workspace owner.
              Dashboard viewing remains available.
            </p>
          </section>
        )}
      </main>
    </>
  );
}
