import { requireApiOwner } from "@/lib/admin";
import { groupSessionsByMonth } from "@/app/livehost/lib/months";
import { parseFiles, readDateRange, readUploadedFiles, saveReport } from "@/app/livehost/lib/report";

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
    const savedReport = await saveReport(report, files, admin.user.email);
    return Response.json({ report: savedReport,
      monthlyPages: [...groupSessionsByMonth(savedReport.sessions ?? []).keys()].sort().map((month) => ({month, url: `/livehost/reports/${month}`})),
      rawFilesArchived: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save this upload.";
    return Response.json({ error: message }, { status: 400 });
  }
}
