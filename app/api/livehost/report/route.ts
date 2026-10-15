import { loadStoredReport } from "@/app/livehost/lib/report";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await loadStoredReport();
  return Response.json({ report });
}
