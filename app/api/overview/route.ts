import { getTeamOverview } from "@/lib/overview";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getTeamOverview(), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "The marketplace overview is temporarily unavailable." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
