import type { Metadata } from "next";
import Link from "next/link";
import PlatformNav from "./platform-nav";
import { getTeamOverview } from "@/lib/overview";
import { loadReportArchive } from "./livehost/lib/report";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CHANDO Ecommerce Dashboard",
  description: "Shopee, Lazada, advertising profit and livehost performance in one private workspace.",
};

const money = new Intl.NumberFormat("en-MY", {
  style: "currency",
  currency: "MYR",
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("en-MY");

export default async function HomePage() {
  const [overview, liveReports] = await Promise.all([
    getTeamOverview(),
    loadReportArchive(),
  ]);
  const livehost = liveReports[0]?.report;

  return (
    <main className="team-overview">
      <PlatformNav active="overview" />
      <header className="overview-header">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark">CH</span>
          <span>
            <strong>CHANDO</strong>
            <small>Ecommerce Dashboard</small>
          </span>
        </Link>
        <span className="overview-access">Private workspace · Malaysia time</span>
      </header>

      <section className="overview-intro">
        <div>
          <span className="section-kicker">ECOMMERCE COMMAND CENTER</span>
          <h1>One view of marketplace growth.</h1>
          <p>
            Track Shopee and Lazada campaigns, advertising contribution profit,
            and livehost performance from one private workspace.
          </p>
        </div>
        <div className="overview-rule">
          <strong>Source-aligned metrics</strong>
          <span>Each module keeps its own period, definitions and audit trail.</span>
        </div>
      </section>

      <section className="platform-grid" aria-label="Platform trackers">
        <a className="platform-card shopee-card" href="/shopee">
          <div className="platform-card-head">
            <span className="platform-badge">S</span>
            <div>
              <span>Shopee</span>
              <strong>Flash Sale cycles</strong>
            </div>
          </div>
          <dl className="platform-stats">
            <div><dt>Confirmed sales</dt><dd>{money.format(overview.shopee.sales)}</dd></div>
            <div><dt>Tracked orders</dt><dd>{integer.format(overview.shopee.orders)}</dd></div>
            <div><dt>Listings</dt><dd>{integer.format(overview.shopee.listings)}</dd></div>
            <div><dt>Uploads</dt><dd>{integer.format(overview.shopee.uploads)}</dd></div>
          </dl>
          <span className="platform-action">Open Shopee tracker</span>
        </a>

        <a className="platform-card lazada-card" href="/lazada">
          <div className="platform-card-head">
            <span className="platform-badge">L</span>
            <div>
              <span>Lazada</span>
              <strong>PDF sales tracker</strong>
            </div>
          </div>
          <dl className="platform-stats">
            <div><dt>Recorded sales</dt><dd>{money.format(overview.lazada.salesValue)}</dd></div>
            <div><dt>Sales count</dt><dd>{integer.format(overview.lazada.salesCount)}</dd></div>
            <div><dt>Sessions</dt><dd>{integer.format(overview.lazada.sessions)}</dd></div>
            <div><dt>Import history</dt><dd>{integer.format(overview.lazada.imports)}</dd></div>
          </dl>
          <span className="platform-action">Open Lazada tracker</span>
        </a>

        <a className="platform-card ads-card" href="/ads-profit">
          <div className="platform-card-head">
            <span className="platform-badge">A</span>
            <div>
              <span>Advertising</span>
              <strong>Ads Profit</strong>
            </div>
          </div>
          <dl className="platform-stats">
            <div><dt>Comparison</dt><dd>Before / After</dd></div>
            <div><dt>Core output</dt><dd>Daily profit</dd></div>
            <div><dt>Efficiency</dt><dd>ROAS + GPM</dd></div>
            <div><dt>Input</dt><dd>Excel / CSV</dd></div>
          </dl>
          <span className="platform-action">Open Ads Profit</span>
        </a>

        <a className="platform-card livehost-card" href="/livehost">
          <div className="platform-card-head">
            <span className="platform-badge">LIVE</span>
            <div>
              <span>Shopee Live</span>
              <strong>Livehost performance</strong>
            </div>
          </div>
          <dl className="platform-stats">
            <div><dt>Latest period</dt><dd>{livehost?.summary.dateRange ?? "No report"}</dd></div>
            <div><dt>Confirmed GMV</dt><dd>{money.format(livehost?.summary.totalGmv ?? 0)}</dd></div>
            <div><dt>Confirmed orders</dt><dd>{integer.format(livehost?.summary.totalOrders ?? 0)}</dd></div>
            <div><dt>Views</dt><dd>{integer.format(livehost?.summary.totalViews ?? 0)}</dd></div>
          </dl>
          <span className="platform-action">Open Livehost dashboard</span>
        </a>
      </section>

      <footer className="overview-footer">
        <span>CHANDO Ecommerce Dashboard</span>
        <span>Access and upload rights are controlled per signed-in user.</span>
      </footer>
    </main>
  );
}
