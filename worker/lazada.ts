export const ALLOWED_UPLOADERS = ["jeehung.chong@chando.my", "jinhui@chando.my"];
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export function validateDraft(input: any) {
  const date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  if (!input || !/^\d+$/.test(input.listingId) || !input.listingTitle?.trim() ||
      !date.test(input.periodStart) || !date.test(input.periodEnd) ||
      !Number.isFinite(Date.parse(input.periodStart + "+08:00")) ||
      !Number.isFinite(Date.parse(input.periodEnd + "+08:00")) ||
      input.periodStart < "2026-09-02T00:00" || input.periodEnd <= input.periodStart)
    throw new Error("Valid Listing ID, title and session dates are required (Malaysia time).");
  if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > 500) throw new Error("Expected 1–500 SKU rows.");
  const seen = new Set();
  const rows = input.rows.map((row: any) => {
    const sku = String(row.sku || "").trim();
    if (!sku || sku.length > 200 || /…|\.\.\.$/.test(sku) || seen.has(sku)) throw new Error("Missing, truncated or duplicate variation name in this session.");
    seen.add(sku);
    if (![row.price, row.stock, row.sales].every(v => typeof v === "number" && Number.isFinite(v) && v >= 0) ||
        !Number.isInteger(row.stock) || !Number.isInteger(row.sales)) throw new Error("Price, stock and sales must be valid non-negative numbers.");
    return { sku, price: row.price, stock: row.stock, sales: row.sales };
  }).sort((a: any, b: any) => a.sku.localeCompare(b.sku));
  return { listingId: input.listingId, listingTitle: input.listingTitle.trim().slice(0, 1000), periodStart: input.periodStart, periodEnd: input.periodEnd, rows };
}
async function digest(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(x => x.toString(16).padStart(2, "0")).join("");
}
export async function lazadaApi(request: Request, env: { DB: D1Database; UPLOADS: R2Bucket }) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || "";
  const canUpload = ALLOWED_UPLOADERS.includes(email);
  try {
    if (request.method === "GET") {
      const sessions = await env.DB.prepare("SELECT session_key, payload FROM lazada_sessions").all<any>();
      const records = sessions.results.flatMap((s: any) => {
        const d = JSON.parse(s.payload);
        return d.rows.map((r: any) => ({ ...r, id: s.session_key + "|" + r.sku, listingId: d.listingId, listingTitle: d.listingTitle, periodStart: d.periodStart, periodEnd: d.periodEnd, sourceNote: "Shared cloud record" }));
      });
      const history = canUpload ? (await env.DB.prepare("SELECT * FROM lazada_imports ORDER BY id DESC").all<any>()).results.map((r: any) => ({ ...JSON.parse(r.payload), id: String(r.id), status: r.status, uploadedBy: r.uploaded_by, importedAt: r.created_at, replaced: r.status === "replaced" })) : [];
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
    const history = JSON.stringify({ ...draft, sourceFile, skuRows: draft.rows.length, salesCount: draft.rows.reduce((n: number, r: any) => n + r.sales, 0), salesValue: draft.rows.reduce((n: number, r: any) => n + r.sales * r.price, 0) });
    // One transaction serializes simultaneous teammates' imports. Same session is never added twice.
    const result = await env.DB.batch([
      env.DB.prepare("INSERT INTO lazada_imports(session_key,payload,status,uploaded_by,created_at,r2_key) SELECT ?,json_set(?, '$.revision', COALESCE((SELECT revision FROM lazada_sessions WHERE session_key=?),0) + CASE WHEN EXISTS(SELECT 1 FROM lazada_sessions WHERE session_key=? AND fingerprint=?) THEN 0 ELSE 1 END), CASE WHEN EXISTS(SELECT 1 FROM lazada_sessions WHERE session_key=? AND fingerprint=?) THEN 'skipped' WHEN EXISTS(SELECT 1 FROM lazada_sessions WHERE session_key=?) THEN 'replaced' ELSE 'added' END,?,?,? RETURNING status").bind(key, history, key, key, fingerprint, key, fingerprint, key, email, now, r2Key),
      env.DB.prepare("INSERT INTO lazada_sessions(session_key,payload,fingerprint,revision) VALUES(?,?,?,1) ON CONFLICT(session_key) DO UPDATE SET payload=excluded.payload, fingerprint=excluded.fingerprint, revision=lazada_sessions.revision + CASE WHEN lazada_sessions.fingerprint=excluded.fingerprint THEN 0 ELSE 1 END").bind(key, payload, fingerprint),
    ]);
    return json({ status: (result[0].results[0] as any).status });
  } catch {
    return json({ error: "Cloud storage is unavailable. Your import was not confirmed; refresh and retry." }, 503);
  }
}
