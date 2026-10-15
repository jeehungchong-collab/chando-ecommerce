import { getChatGPTUser } from "@/app/chatgpt-auth";
import { claimOrVerifyAdmin } from "./data";

export async function requireApiAdmin() {
  const user = await getChatGPTUser();
  if (!user) {
    return { ok: false as const, status: 401, message: "Sign in with ChatGPT to continue." };
  }
  const allowed = await claimOrVerifyAdmin(user.email);
  if (!allowed) {
    return { ok: false as const, status: 403, message: "This account is not an approved tracker admin." };
  }
  return { ok: true as const, user };
}

export function isWorkspaceOwner(email: string) {
  return email.trim().toLowerCase() === "jeehung.chong@chando.my";
}

export async function requireApiOwner() {
  const user = await getChatGPTUser();
  if (!user) {
    return { ok: false as const, status: 401, message: "Sign in with ChatGPT to continue." };
  }
  if (!isWorkspaceOwner(user.email)) {
    return { ok: false as const, status: 403, message: "Owner access is required for Livehost uploads." };
  }
  return { ok: true as const, user };
}
