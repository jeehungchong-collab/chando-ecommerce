import { requireApiAdmin } from "@/lib/admin";
import {
  createRestartCampaign,
  previewRestartCandidates,
} from "@/lib/data";

export async function GET(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) {
    return Response.json({ error: auth.message }, { status: auth.status });
  }
  try {
    const url = new URL(request.url);
    const sourceCampaignId = url.searchParams.get("sourceCampaignId") ?? "";
    const sourceCycle = Number(url.searchParams.get("sourceCycle") ?? 2);
    const preview = await previewRestartCandidates(
      sourceCampaignId,
      sourceCycle,
    );
    return Response.json({ preview });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Restart candidates could not be loaded.",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) {
    return Response.json({ error: auth.message }, { status: auth.status });
  }
  try {
    const body = (await request.json()) as {
      sourceCampaignId?: string;
      sourceCycle?: number;
      name?: string;
    };
    const result = await createRestartCampaign({
      sourceCampaignId: body.sourceCampaignId ?? "",
      sourceCycle: Number(body.sourceCycle ?? 2),
      name: body.name,
      createdBy: auth.user.email,
    });
    return Response.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Restart campaign could not be created.",
      },
      { status: 400 },
    );
  }
}
