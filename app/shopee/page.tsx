import type { Metadata } from "next";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  claimOrVerifyAdmin,
  getCombinedDashboard,
  listCampaigns,
  listCompletionListings,
} from "@/lib/data";
import DashboardClient from "../dashboard-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CHANDO Shopee Team Tracker",
  description:
    "One continuous CHANDO Flash Sale tracker by listing, SKU, and 3-day cycle.",
};

export default async function ShopeePage() {
  // The dashboard's "as of" label intentionally reflects request time.
  // eslint-disable-next-line react-hooks/purity
  const asOf = new Date(Date.now() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
  const dashboard = await getCombinedDashboard();
  const user = await getChatGPTUser();
  const isAdmin = user ? await claimOrVerifyAdmin(user.email) : false;
  const admin = isAdmin && user
    ? {
        user: { displayName: user.displayName, email: user.email },
        campaigns: await listCampaigns(),
        uploads: dashboard.uploads,
        completionListings: await listCompletionListings(),
      }
    : null;

  return <DashboardClient dashboard={dashboard} asOf={asOf} admin={admin} />;
}
