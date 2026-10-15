export const ALLOWED_UPLOADERS = ["jeehung.chong@chando.my", "jinhui@chando.my"];

type LazadaRow = {
  sku: string;
  price: number;
  stock: number;
  sales: number;
};

type LazadaDraft = {
  listingId: string;
  listingTitle: string;
  periodStart: string;
  periodEnd: string;
  rows: LazadaRow[];
};

type SessionDbRow = { session_key: string; payload: string };
type ImportDbRow = {
  id: string | number;
  payload: string;
  status: string;
  uploaded_by: string;
  created_at: string;
};
type StatusDbRow = { status: string };

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export function validateDraft(input: unknown): LazadaDraft {
  if (!input || typeof input !== "object") {
    throw new Error("Valid Listing ID, title and session dates are required (Malaysia time).");
  }
  const candidate = input as Record<string, unknown>;
  const listingId = typeof candidate.listingId === "string" ? candidate.listingId : "";
  const listingTitle = typeof candidate.listingTitle === "string" ? candidate.listingTitle : "";
  const periodStart = typeof candidate.periodStart === "string" ? candidate.periodStart : "";
  const periodEnd = typeof candidate.periodEnd === "string" ? candidate.periodEnd : "";
  const date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  if (!/^\d+$/.test(listingId) || !listingTitle.trim() ||
      !date.test(periodStart) || !date.test(periodEnd) ||
      !Number.isFinite(Date.parse(periodStart + "+08:00")) ||
      !Number.isFinite(Date.parse(periodEnd + "+08:00")) ||
      periodStart < "2026-09-02T00:00" || periodEnd <= periodStart)
    throw new Error("Valid Listing ID, title and session dates are required (Malaysia time).");
  if (!Array.isArray(candidate.rows) || !candidate.rows.length || candidate.rows.length > 500) throw new Error("Expected 1–500 SKU rows.");
  const seen = new Set<string>();
  const rows = candidate.rows.map((value): LazadaRow => {
    if (!value || typeof value !== "object") throw new Error("Invalid SKU row.");
    const row = value as Record<string, unknown>;
    const sku = String(row.sku || "").trim();
    if (!sku || sku.length > 200 || /…|\.\.\.$/.test(sku) || seen.has(sku)) throw new Error("Missing, truncated or duplicate variation name in this session.");
    seen.add(sku);
    if (![row.price, row.stock, row.sales].every(v => typeof v === "number" && Number.isFinite(v) && v >= 0) ||
        !Number.isInteger(row.stock) || !Number.isInteger(row.sales)) throw new Error("Price, stock and sales must be valid non-negative numbers.");
    return { sku, price: row.price as number, stock: row.stock as number, sales: row.sales as number };
  }).sort((a, b) => a.sku.localeCompare(b.sku));
  return { listingId, listingTitle: listingTitle.trim().slice(0, 1000), periodStart, periodEnd, rows };
}
async function digest(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(x => x.toString(16).padStart(2, "0")).join("");
}
export async function lazadaApi(request: Request, env: { DB: D1Database; UPLOADS: R2Bucket }) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || "";
  const canUpload = ALLOWED_UPLOADERS.includes(email);
  try {
    if (request.method === "GET") {
      const sessions = await env.DB.prepare("SELECT session_key, payload FROM lazada_sessions").all<SessionDbRow>();
      const records = sessions.results.flatMap((session) => {
        const draft = JSON.parse(session.payload) as LazadaDraft;
        return draft.rows.map((row) => ({ ...row, id: session.session_key + "|" + row.sku, listingId: draft.listingId, listingTitle: draft.listingTitle, periodStart: draft.periodStart, periodEnd: draft.periodEnd, sourceNote: "Shared cloud record" }));
      });
      const history = canUpload ? (await env.DB.prepare("SELECT * FROM lazada_imports ORDER BY id DESC").all<ImportDbRow>()).results.map((row) => ({ ...JSON.parse(row.payload), id: String(row.id), status: row.status, uploadedBy: row.uploaded_by, importedAt: row.created_at, replaced: row.status === "replaced" })) : [];
      return json({ records, history, canUpload, email });
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!canUpload) return json({ error: email ? "This account is not authorized to upload." : "Sign in before uploading." }, email ? 403 : 401);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "Invalid origin" }, 403);
    if (Number(request.headers.get("content-length")) > 16 * 1024 * 1024) return json({ error: "Maximum file size is 15 MB." }, 413);
    const form = await request.formData();
    const file = form.get("file");
    let r2Key: string | null = null;
    if (file instanceof File) {
      if (file.size > 15 * 1024 * 1024) return json({ error: "Maximum file size is 15 MB." }, 413);
      const bytes = await file.arrayBuffer();
      r2Key = "lazada-v2/" + await digest(bytes);
      await env.UPLOADS.put(r2Key, bytes, { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    }
    const sourceFile = file instanceof File ? file.name.slice(0, 250) : "Manual screenshot entry";
    const now = new Date().toISOString();
    let draft;
    try {
      if (form.get("error")) throw new Error(String(form.get("error")).slice(0, 500));
      draft = validateDraft(JSON.parse(String(form.get("draft"))));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unreadable import";
      const payload = { sourceFile, error: message, listingId: "", listingTitle: "", periodStart: "", periodEnd: "", skuRows: 0, salesCount: 0, salesValue: 0, revision: 0 };
      await env.DB.prepare("INSERT INTO lazada_imports(session_key,payload,status,uploaded_by,created_at,r2_key) VALUES(?,?,'failed',?,?,?)").bind("", JSON.stringify(payload), email, now, r2Key).run();
      return json({ status: "failed", error: message }, 400);
    }
    const key = [draft.listingId, draft.periodStart, draft.periodEnd].join("|");
    const payload = JSON.stringify(draft);
    const fingerprint = await digest(new TextEncoder().encode(JSON.stringify(draft.rows)).buffer);
    const history = JSON.stringify({ ...draft, sourceFile, skuRows: draft.rows.length, salesCount: draft.rows.reduce((n, row) => n + row.sales, 0), salesValue: draft.rows.reduce((n, row) => n + row.sales * row.price, 0) });
    // One transaction serializes simultaneous teammates' imports. Same session is never added twice.
    const result = await env.DB.batch([
      env.DB.prepare("INSERT INTO lazada_imports(session_key,payload,status,uploaded_by,created_at,r2_key) SELECT ?,json_set(?, '$.revision', COALESCE((SELECT revision FROM lazada_sessions WHERE session_key=?),0) + CASE WHEN EXISTS(SELECT 1 FROM lazada_sessions WHERE session_key=? AND fingerprint=?) THEN 0 ELSE 1 END), CASE WHEN EXISTS(SELECT 1 FROM lazada_sessions WHERE session_key=? AND fingerprint=?) THEN 'skipped' WHEN EXISTS(SELECT 1 FROM lazada_sessions WHERE session_key=?) THEN 'replaced' ELSE 'added' END,?,?,? RETURNING status").bind(key, history, key, key, fingerprint, key, fingerprint, key, email, now, r2Key),
      env.DB.prepare("INSERT INTO lazada_sessions(session_key,payload,fingerprint,revision) VALUES(?,?,?,1) ON CONFLICT(session_key) DO UPDATE SET payload=excluded.payload, fingerprint=excluded.fingerprint, revision=lazada_sessions.revision + CASE WHEN lazada_sessions.fingerprint=excluded.fingerprint THEN 0 ELSE 1 END").bind(key, payload, fingerprint),
    ]);
    return json({ status: (result[0].results[0] as StatusDbRow).status });
  } catch {
    return json({ error: "Cloud storage is unavailable. Your import was not confirmed; refresh and retry." }, 503);
  }
}
