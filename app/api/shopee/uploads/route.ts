import { requireApiAdmin } from "@/lib/admin";
import {
  replaceSessionUpload,
} from "@/lib/data";
import { parseFlashSaleWorkbook } from "@/lib/parser";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) {
    return Response.json({ error: auth.message }, { status: auth.status });
  }
  try {
    const form = await request.formData();
    const campaignId = String(form.get("campaignId") ?? "");
    const file = form.get("file");
    if (!campaignId) throw new Error("Choose a campaign.");
    if (!(file instanceof File)) throw new Error("Choose an Excel workbook.");
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      throw new Error("Only Shopee .xlsx exports are supported.");
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error("The workbook is larger than the 15 MB upload limit.");
    }
    const bytes = await file.arrayBuffer();
    const parsed = parseFlashSaleWorkbook(bytes);
    const result = await replaceSessionUpload({
      campaignId,
      parsed,
      sourceFile: file.name,
      bytes,
      uploadedBy: auth.user.email,
    });
    return Response.json({
      ...result,
      sessionStart: parsed.sessionStart,
      sessionEnd: parsed.sessionEnd,
      replaced: result.revision > 1,
      routedCampaigns: result.routedCampaignIds.length,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The workbook could not be imported.",
      },
      { status: 400 },
    );
  }
}
