import type { Metadata } from "next";
import LazadaTrackerClient from "./lazada-client";
import "../lazada.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lazada Tracker",
  description: "Lazada Flash Sale PDF imports and three-day cycle reporting.",
};

export default function LazadaPage() {
  return <LazadaTrackerClient />;
}
