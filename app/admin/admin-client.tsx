"use client";

import { FormEvent, useState } from "react";
import type {
  CampaignSummary,
  CompletionListing,
  UploadSummary,
} from "@/lib/types";

type Notice = { type: "success" | "error"; message: string } | null;

export type AdminClientProps = {
  user: { displayName: string; email: string };
  campaigns: CampaignSummary[];
  uploads: UploadSummary[];
  completionListings: CompletionListing[];
  embedded?: boolean;
};

export default function AdminClient({
  user,
  campaigns: initialCampaigns,
  uploads: initialUploads,
  completionListings: initialCompletionListings,
  embedded = false,
}: AdminClientProps) {
  const [campaigns] = useState(initialCampaigns);
  const [completionListings, setCompletionListings] = useState(
    initialCompletionListings,
  );
  const [selectedCampaign, setSelectedCampaign] = useState(
    initialCampaigns[0]?.id ?? "",
  );
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [showAllUploads, setShowAllUploads] = useState(false);
  const [showCompletedListings, setShowCompletedListings] = useState(false);
  const [busy, setBusy] = useState<
    "upload" | "completion" | null
  >(null);
  const visibleUploads = showAllUploads
    ? initialUploads
    : initialUploads.slice(0, 5);
  const activeCompletionListings = completionListings.filter(
    (listing) => !listing.doneComplete,
  );
  const completedCompletionListings = completionListings.filter(
    (listing) => listing.doneComplete,
  );

  function CompletionRow({ listing }: { listing: CompletionListing }) {
    return (
      <article
        className={listing.doneComplete ? "completion-row done" : "completion-row"}
      >
        <div>
          <span className="id-label">ITEM {listing.itemId}</span>
          <strong>{listing.listingTitle}</strong>
          <small>
            {listing.totalOrders} orders · RM{listing.totalSales.toFixed(2)}
          </small>
          <small>
            Current streak {listing.successStreak}/4 · best{" "}
            {listing.longestSuccessStreak}/4
            {listing.readyToComplete ? " · ready to mark done" : ""}
          </small>
          {listing.activeBaselineCycle && listing.activeBaselineOrders ? (
            <small>
              {listing.selectedPathStatus ?? "active"} path · C
              {listing.activeBaselineCycle}: {listing.activeBaselineOrders} orders
            </small>
          ) : null}
        </div>
        <button
          className={listing.doneComplete ? "ghost-button" : "primary-button"}
          onClick={() => toggleCompletion(listing)}
          disabled={busy !== null}
          type="button"
        >
          {listing.doneComplete ? "Move back active" : "Mark done complete"}
        </button>
      </article>
    );
  }

  async function toggleCompletion(listing: CompletionListing) {
    setBusy("completion");
    setNotice(null);
    const nextCompleted = !listing.doneComplete;
    try {
      const response = await fetch("/api/shopee/listings/completion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId: listing.itemId,
          listingTitle: listing.listingTitle,
          completed: nextCompleted,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          payload.error || "Listing completion could not be updated.",
        );
      }
      setCompletionListings((current) =>
        current.map((candidate) =>
          candidate.itemId === listing.itemId
            ? { ...candidate, doneComplete: nextCompleted }
            : candidate,
        ),
      );
      setNotice({
        type: "success",
        message: `${nextCompleted ? "Moved to Done complete" : "Moved back to active"}: ${listing.itemId}.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Listing completion could not be updated.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function uploadWorkbook(event: FormEvent) {
    event.preventDefault();
    if (!files.length || !selectedCampaign) return;
    setBusy("upload");
    setNotice(null);
    setUploadProgress({ current: 0, total: files.length });
    const completed: string[] = [];
    const failed: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setUploadProgress({ current: index + 1, total: files.length });
        const body = new FormData();
        body.append("campaignId", selectedCampaign);
        body.append("file", file);
        try {
          const response = await fetch("/api/shopee/uploads", { method: "POST", body });
          const payload = (await response.json()) as {
            error?: string;
            revision?: number;
            sessionStart?: string;
            replaced?: boolean;
          };
          if (!response.ok) {
            throw new Error(payload.error || "The workbook could not be imported.");
          }
          completed.push(
            `${file.name} (${payload.replaced ? "replaced" : "imported"}, revision ${payload.revision})`,
          );
        } catch (error) {
          failed.push(
            `${file.name}: ${error instanceof Error ? error.message : "Import failed"}`,
          );
        }
      }

      setNotice({
        type: failed.length ? "error" : "success",
        message: failed.length
          ? `Imported ${completed.length} of ${files.length}. Failed: ${failed.join(" · ")}`
          : `Imported all ${completed.length} workbooks successfully. Refresh the page to see the latest revisions and totals.`,
      });
      setFiles([]);
      const input = document.getElementById("workbook") as HTMLInputElement | null;
      if (input) input.value = "";
    } finally {
      setBusy(null);
      setUploadProgress(null);
    }
  }

  const Shell = embedded ? "section" : "main";

  return (
    <Shell
      className={embedded ? "admin-page inline-admin-workspace" : "admin-page"}
      id={embedded ? "admin-workspace" : undefined}
    >
      {!embedded && <header className="site-header">
        <a className="brand-lockup" href="/">
          <span className="brand-mark">CH</span>
          <span>
            <strong>CHANDO</strong>
            <small>Flash Sale admin</small>
          </span>
        </a>
        <div className="header-actions">
          <span className="admin-identity">
            <strong>{user.displayName}</strong>
            <small>{user.email}</small>
          </span>
          <a className="ghost-button" href="/">
            View dashboard
          </a>
        </div>
      </header>}

      <section className={embedded ? "inline-admin-heading" : "admin-hero"}>
        <div>
          <span className="section-kicker">Admin workspace</span>
          {embedded ? (
            <h2>Import files and manage listings here.</h2>
          ) : (
            <h1>Keep every cycle clean and current.</h1>
          )}
          <p>
            Upload the Shopee Confirmed Order file. Matching session periods are
            replaced automatically, while earlier revisions stay in the audit
            history.
          </p>
        </div>
        <div className="admin-rule">
          <strong>No double counting</strong>
          <span>Campaign + session start/end is the replacement key.</span>
        </div>
      </section>

      {notice && (
        <div className={`admin-notice ${notice.type}`} role="status">
          {notice.message}
        </div>
      )}

      <section className="admin-grid single-admin-grid">
        <form className="admin-card upload-card" onSubmit={uploadWorkbook}>
          <div className="admin-card-head">
            <span>01</span>
            <div>
              <h2>Import Shopee workbook</h2>
              <p>Only the Confirmed Order sheet is read. Flash PMS is ignored.</p>
            </div>
          </div>
          <label>
            Campaign
            <select
              value={selectedCampaign}
              onChange={(event) => setSelectedCampaign(event.target.value)}
              required
            >
              {campaigns.map((campaign) => (
                <option value={campaign.id} key={campaign.id}>
                  {campaign.name} · starts {campaign.startDate}
                </option>
              ))}
            </select>
          </label>
          <label className="file-drop" htmlFor="workbook">
            <span className="file-icon">XLSX</span>
            <strong>
              {files.length
                ? `${files.length} workbook${files.length === 1 ? "" : "s"} selected`
                : "Choose Shopee Flash Sale files"}
            </strong>
            <small>
              Multiple .xlsx files supported · maximum 15 MB each · originals retained
            </small>
            {files.length > 0 && (
              <span className="selected-file-list">
                {files.map((selectedFile) => selectedFile.name).join(" · ")}
              </span>
            )}
            <input
              id="workbook"
              type="file"
              multiple
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              required
            />
          </label>
          <button
            className="primary-button admin-submit"
            disabled={!files.length || !selectedCampaign || busy !== null}
          >
            {busy === "upload" && uploadProgress
              ? `Importing ${uploadProgress.current} of ${uploadProgress.total}…`
              : files.length > 1
                ? `Import ${files.length} workbooks`
                : "Import workbook"}
          </button>
        </form>
      </section>

      <section className="admin-history">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Audit trail</span>
            <h2>Recent upload revisions</h2>
          </div>
          <p>Latest 5 imports stay visible. Older revisions are kept for audit.</p>
        </div>
        <div className="history-list">
          {visibleUploads.map((upload) => (
            <article key={upload.id}>
              <span className={upload.active ? "status active" : "status replaced"}>
                {upload.active ? "Active" : "Replaced"}
              </span>
              <div>
                <strong>{upload.sourceFile}</strong>
                <span>
                  {upload.sessionStart} → {upload.sessionEnd}
                </span>
              </div>
              <div className="history-meta">
                <strong>Revision {upload.revision}</strong>
                <span>{upload.uploadedBy}</span>
              </div>
            </article>
          ))}
        </div>
        {initialUploads.length > 5 && (
          <button
            className="text-button history-toggle"
            type="button"
            onClick={() => setShowAllUploads((current) => !current)}
          >
            {showAllUploads
              ? "Collapse older uploads"
              : `Show older uploads (${initialUploads.length - 5})`}
          </button>
        )}
      </section>

      <section className="admin-history">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Manual status</span>
            <h2>Move listings to Done complete</h2>
          </div>
          <p>
            Done listings stay visible on the public tracker, but move to the
            bottom so the active working list stays clean.
          </p>
        </div>
        <div className="completion-list">
          {activeCompletionListings.map((listing) => (
            <CompletionRow listing={listing} key={listing.itemId} />
          ))}
          {completedCompletionListings.length > 0 && (
            <button
              className="completed-listings-toggle completion-done-toggle"
              type="button"
              onClick={() => setShowCompletedListings((current) => !current)}
              aria-expanded={showCompletedListings}
            >
              <span>
                <strong>Done complete</strong>
                <small>{completedCompletionListings.length} listings</small>
              </span>
              <span>
                {showCompletedListings ? "Collapse completed" : "Show completed"}
              </span>
            </button>
          )}
          {showCompletedListings &&
            completedCompletionListings.map((listing) => (
              <CompletionRow listing={listing} key={listing.itemId} />
            ))}
        </div>
      </section>
    </Shell>
  );
}
