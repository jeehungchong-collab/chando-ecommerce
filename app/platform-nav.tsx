import Link from "next/link";

type PlatformNavProps = {
  active: "overview" | "shopee" | "lazada" | "ads" | "livehost";
};

export default function PlatformNav({ active }: PlatformNavProps) {
  return (
    <nav className="platform-nav" aria-label="Platform navigation">
      <Link aria-current={active === "overview" ? "page" : undefined} href="/">Overview</Link>
      <Link aria-current={active === "shopee" ? "page" : undefined} href="/shopee">Shopee</Link>
      <Link aria-current={active === "lazada" ? "page" : undefined} href="/lazada">Lazada</Link>
      <Link aria-current={active === "ads" ? "page" : undefined} href="/ads-profit">Ads Profit</Link>
      <Link aria-current={active === "livehost" ? "page" : undefined} href="/livehost">Livehost</Link>
    </nav>
  );
}
