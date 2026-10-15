import { requireChatGPTUser, chatGPTSignOutPath } from "@/app/chatgpt-auth";
import { claimOrVerifyAdmin } from "@/lib/data";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");
  const allowed = await claimOrVerifyAdmin(user.email);
  if (!allowed) {
    return (
      <main className="admin-page">
        <section className="admin-denied">
          <span className="section-kicker">Access restricted</span>
          <h1>This account is not an approved tracker admin.</h1>
          <p>
            You are signed in as {user.email}. Ask the tracker owner to add this
            email to the admin allowlist.
          </p>
          <a className="ghost-button" href={chatGPTSignOutPath("/")}>
            Sign out
          </a>
        </section>
      </main>
    );
  }
  redirect("/#admin-workspace");
}
