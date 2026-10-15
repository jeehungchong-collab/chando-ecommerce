import type { Metadata } from "next";
import PlatformNav from "../platform-nav";

export const metadata: Metadata = {
  title: "Ads Profit",
  description: "Compare Shopee advertising periods and contribution profit.",
};

export default function AdsProfitPage() {
  return (
    <main className="module-page ads-module-page">
      <PlatformNav active="ads" />
      <header className="module-header">
        <div>
          <span className="section-kicker">ADVERTISING PROFITABILITY</span>
          <h1>Ads Profit</h1>
          <p>Import two Shopee advertising periods and compare daily contribution profit.</p>
        </div>
        <span className="module-note">Files are processed inside your browser.</span>
      </header>
      <iframe
        className="ads-profit-frame"
        src="/ads-profit-app/index.html"
        title="CHANDO Ads Profit calculator"
      />
    </main>
  );
}
