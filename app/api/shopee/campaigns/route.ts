import { createCampaign } from "@/lib/data";
import { requireApiAdmin } from "@/lib/admin";

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) {
    return Response.json({ error: auth.message }, { status: auth.status });
  }
  try {
    const body = (await request.json()) as { name?: string; startDate?: string };
    const campaign = await createCampaign({
      name: body.name ?? "",
      startDate: body.startDate ?? "",
    });
    return Response.json({ campaign }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Campaign could not be created." },
      { status: 400 },
    );
  }
}
