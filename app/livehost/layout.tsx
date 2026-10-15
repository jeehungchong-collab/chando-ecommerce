import PlatformNav from "../platform-nav";
import "./livehost.css";

export default function LivehostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="livehost-root">
      <PlatformNav active="livehost" />
      {children}
    </div>
  );
}
