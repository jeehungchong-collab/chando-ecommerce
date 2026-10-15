type PlatformNavProps = {
  active: "overview" | "shopee" | "lazada" | "ads" | "livehost";
};

export default function PlatformNav({ active }: PlatformNavProps) {
  return (
    <nav className="platform-nav" aria-label="Platform navigation">
      <a aria-current={active === "overview" ? "page" : undefined} href="/">Overview</a>
      <a aria-current={active === "shopee" ? "page" : undefined} href="/shopee">Shopee</a>
      <a aria-current={active === "lazada" ? "page" : undefined} href="/lazada">Lazada</a>
      <a aria-current={active === "ads" ? "page" : undefined} href="/ads-profit">Ads Profit</a>
      <a aria-current={active === "livehost" ? "page" : undefined} href="/livehost">Livehost</a>
    </nav>
  );
}
