import { env } from "cloudflare:workers";

export async function listRawBackups(offset: number) {
  const db = (env as unknown as { DB: D1Database }).DB;
  const { results } = await db.prepare(`
    SELECT f.id, f.file_name, f.size_bytes, f.created_at, r.uploaded_by_email, r.date_range
    FROM uploaded_files f JOIN report_uploads r ON r.id = f.report_id
    ORDER BY f.created_at DESC, f.id DESC LIMIT 51 OFFSET ?
  `).bind(offset).all<{
    id: string; file_name: string; size_bytes: number; created_at: string;
    uploaded_by_email: string; date_range: string;
  }>();
  return { files: (results ?? []).slice(0, 50), hasMore: (results ?? []).length > 50 };
}

export async function getRawBackup(id: string) {
  const { DB: db, UPLOADS: uploads } = env as unknown as { DB: D1Database; UPLOADS: R2Bucket };
  const file = await db.prepare("SELECT file_name, content_type, r2_key FROM uploaded_files WHERE id = ?")
    .bind(id).first<{ file_name: string; content_type: string; r2_key: string }>();
  if (!file) return null;
  const object = await uploads.get(file.r2_key);
  return object ? { file, object } : null;
}
