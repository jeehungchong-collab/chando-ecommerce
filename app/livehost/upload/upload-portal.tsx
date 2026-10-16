"use client";

import { FormEvent, useMemo, useState } from "react";
import type { HostReport, TimingReport, UploadSummary } from "../lib/report";

type PreviewState = {
  summary: UploadSummary;
  timing: TimingReport[];
  hosts: HostReport[];
  unclearRows: unknown[];
};

function money(value: number) {
  return `RM${value.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function UploadPortal() {
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [message, setMessage] = useState("");
  const [monthlyPages, setMonthlyPages] = useState<{ month: string; url: string }[]>([]);
  const [status, setStatus] = useState<"idle" | "validating" | "ready" | "committing" | "done" | "error">("idle");

  const canPreview = files.length > 0 && status !== "validating" && status !== "committing";
  const fileLabel = useMemo(
    () => (files.length ? files.map((file) => file.name).join(", ") : "No files selected"),
    [files],
  );

  async function previewUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("validating");
    setMessage("Validating Shopee export columns and recalculating performance...");
    setPreview(null);

    try {
      const result = await postFiles("/api/livehost/uploads/preview", files);
      setPreview(result);
      setStatus("ready");
      setMessage("Preview ready. Confirm to update the included monthly pages. Other months and earlier upload files are retained.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Preview failed.");
    }
  }

  async function commitUpload() {
    setStatus("committing");
    setMessage("Saving upload and updating the public dashboard...");
    try {
      const saved = await postFiles("/api/livehost/uploads/commit", files);
      setMonthlyPages(saved.monthlyPages ?? []);
      setStatus("done");
      setMessage("Monthly report saved. Original files archived privately in cloud storage; earlier months are retained.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Update failed.");
    }
  }

  return (
    <section className="upload-panel">
      <p><a href="/livehost/upload/backups">Original file archive</a></p>
      <details className="export-tutorial" open>
        <summary>How to export the weekly file from Shopee</summary>
        <div className="export-tutorial-body">
          <ol>
            <li>Open <strong>Shopee Seller Centre</strong>, then go to the livestream performance or livestream data section.</li>
            <li>Set the report period to the full week: <strong>Monday through Sunday</strong>.</li>
            <li>Export the <strong>livestream session performance detail</strong> for every host and every session in that week.</li>
            <li>Download the report as <strong>CSV or Excel</strong>, then upload the original file below. Do not rename or delete columns.</li>
          </ol>
          <div className="export-file-check">
            <strong>Choose the file that contains these columns</strong>
            <p>Livestream Name · Start Time · Duration · Viewers · ATC · Orders (Confirmed Order) · Items Sold (Confirmed Order) · Sales (Confirmed Order)</p>
          </div>
          <p className="export-tutorial-note">
            Shopee may use slightly different menu names in different Seller Centre versions. Check the column names before uploading. If the week is split across several exports, select all files together.
          </p>
        </div>
      </details>
      <form onSubmit={previewUpload}>
        <label className="file-drop">
          <span>Select Shopee export files</span>
          <input
            type="file"
            multiple
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              setFiles(Array.from(event.target.files ?? []));
              setPreview(null);
              setStatus("idle");
              setMessage("");
              setMonthlyPages([]);
            }}
          />
          <strong>{fileLabel}</strong>
        </label>
        <button type="submit" disabled={!canPreview}>
          Preview Upload
        </button>
      </form>

      {message ? <p className={`upload-status ${status}`}>{message}</p> : null}
      {monthlyPages.length ? <p>{monthlyPages.map((page) => <a key={page.month} href={page.url} style={{ marginRight: 20 }}>Open {page.month} report</a>)}</p> : null}

      {preview ? (
        <div className="preview-block">
          <div className="preview-summary">
            <div>
              <span>Total rows</span>
              <strong>{preview.summary.rowCount.toLocaleString("en-MY")}</strong>
            </div>
            <div>
              <span>Date range</span>
              <strong>{preview.summary.dateRange}</strong>
            </div>
            <div>
              <span>GMV</span>
              <strong>{money(preview.summary.totalGmv)}</strong>
            </div>
            <div>
              <span>Orders</span>
              <strong>{preview.summary.totalOrders.toLocaleString("en-MY")}</strong>
            </div>
            <div>
              <span>Views / impressions</span>
              <strong>{preview.summary.totalViews.toLocaleString("en-MY")}</strong>
            </div>
            <div>
              <span>Unclear rows</span>
              <strong>{preview.summary.unclearRows}</strong>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Host</th>
                  <th>GMV/hr</th>
                  <th>GMV</th>
                  <th>Orders</th>
                  <th>Views</th>
                  <th>Conversion</th>
                </tr>
              </thead>
              <tbody>
                {preview.hosts.map((host) => (
                  <tr key={host.name}>
                    <td>{host.name}</td>
                    <td>{money(host.gmvHour)}</td>
                    <td>{money(host.gmv)}</td>
                    <td>{host.orders}</td>
                    <td>{host.views.toLocaleString("en-MY")}</td>
                    <td>{host.viewerCvr.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" className="confirm-button" disabled={status === "committing" || status === "done"} onClick={commitUpload}>
            Confirm Update Dashboard
          </button>
        </div>
      ) : null}
    </section>
  );
}

async function postFiles(url: string, files: File[]) {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);
  const response = await fetch(url, { method: "POST", body: formData });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Upload failed.");
  }
  return payload;
}
