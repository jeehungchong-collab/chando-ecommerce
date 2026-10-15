import { requireApiOwner } from "@/lib/admin";
import { parseFiles, readDateRange, readUploadedFiles } from "@/app/livehost/lib/report";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = await requireApiOwner();
  if (!admin.ok) {
    return Response.json({ error: admin.message }, { status: admin.status });
  }

  try {
    const formData = await request.formData();
    const files = await readUploadedFiles(formData);
    const report = await parseFiles(files, readDateRange(formData));
    return Response.json({
      summary: report.summary,
      timing: report.timing,
      hosts: report.hosts,
      unclearRows: report.unclearRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process this upload.";
    return Response.json({ error: message }, { status: 400 });
  }
}
