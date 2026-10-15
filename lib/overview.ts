import { env } from "cloudflare:workers";
import { getCombinedDashboard } from "./data";

type LazadaPayload = {
  listingId?: string;
  periodStart?: string;
  rows?: Array<{ price?: number; sales?: number }>;
};

export type TeamOverview = {
  shopee: { sales: number; orders: number; listings: number; uploads: number };
  lazada: { salesValue: number; salesCount: number; sessions: number; imports: number; listings: number; latestPeriod: string | null };
};

export async function getTeamOverview(): Promise<TeamOverview> {
  const dashboard = await getCombinedDashboard();
  const database = (env as unknown as { DB: D1Database }).DB;
  const [sessionsResult, importsResult] = await Promise.all([
    database.prepare("SELECT payload FROM lazada_sessions").all<{ payload: string }>(),
    database.prepare("SELECT COUNT(*) AS count FROM lazada_imports").first<{ count: number }>(),
  ]);

  const listings = new Set<string>();
  let salesValue = 0;
  let salesCount = 0;
  let latestPeriod: string | null = null;
  for (const record of sessionsResult.results) {
    let payload: LazadaPayload;
    try {
      payload = JSON.parse(record.payload) as LazadaPayload;
    } catch {
      continue;
    }
    if (payload.listingId) listings.add(payload.listingId);
    if (payload.periodStart && (!latestPeriod || payload.periodStart > latestPeriod)) latestPeriod = payload.periodStart;
    for (const row of payload.rows ?? []) {
      const sold = Number(row.sales ?? 0);
      const price = Number(row.price ?? 0);
      if (!Number.isFinite(sold) || !Number.isFinite(price)) continue;
      salesCount += sold;
      salesValue += sold * price;
    }
  }

  return {
    shopee: {
      sales: dashboard.totals.sales,
      orders: dashboard.totals.orders,
      listings: dashboard.listings.length,
      uploads: dashboard.uploads.length,
    },
    lazada: {
      salesValue,
      salesCount,
      sessions: sessionsResult.results.length,
      imports: Number(importsResult?.count ?? 0),
      listings: listings.size,
      latestPeriod,
    },
  };
}
