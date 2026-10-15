import { requireApiOwner } from "@/lib/admin";
import { getRawBackup } from "@/app/livehost/lib/backups";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireApiOwner();
  if (!admin.ok) return Response.json({ error: admin.message }, { status: admin.status });
  const { id } = await params;
  const backup = await getRawBackup(id);
  if (!backup) return Response.json({ error: "Original file not found." }, { status: 404 });
  return new Response(backup.object.body, { headers: {
    "Content-Type": backup.file.content_type || "application/octet-stream",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(backup.file.file_name).replace(/'/g, "%27")}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
