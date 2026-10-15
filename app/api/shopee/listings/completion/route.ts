import { requireApiAdmin } from "@/lib/admin";
import { setListingDoneComplete } from "@/lib/data";

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) {
    return Response.json({ error: auth.message }, { status: auth.status });
  }
  try {
    const body = (await request.json()) as {
      itemId?: string;
      listingTitle?: string;
      completed?: boolean;
    };
    await setListingDoneComplete({
      itemId: body.itemId ?? "",
      listingTitle: body.listingTitle ?? "",
      completed: Boolean(body.completed),
      updatedBy: auth.user.email,
    });
    return Response.json({ ok: true, completed: Boolean(body.completed) });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Listing completion could not be updated.",
      },
      { status: 400 },
    );
  }
}
