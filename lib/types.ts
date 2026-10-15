export type MetricTotals = {
  sales: number;
  orders: number;
  units: number;
  reminderClicks: number;
  impressions: number;
  clicks: number;
};

export type CycleSummary = MetricTotals & {
  cycle: number;
  startDate: string;
  endDate: string;
  individualWindows?: boolean;
  sessions: number;
  ctr: number;
  cvr: number;
  aov: number;
};

export type CycleWindow = {
  cycle: number;
  startDate: string;
  endDate: string;
};

export type VariationPerformance = {
  variationId: string;
  variationTitle: string;
  sku: string;
  cycles: MetricTotals[];
  total: MetricTotals;
};

export type ListingPerformance = {
  itemId: string;
  listingTitle: string;
  cycles: MetricTotals[];
  goals: Array<number | null>;
  progress: Array<number | null>;
  cycleStatuses: Array<"baseline" | "pass" | "fail" | "recovered" | "waiting">;
  successStreak: number;
  longestSuccessStreak: number;
  readyToComplete: boolean;
  activeBaselineCycle?: number | null;
  activeBaselineOrders?: number | null;
  selectedPathStatus?: "complete" | "active" | "failed" | null;
  doneComplete?: boolean;
  completedBy?: string | null;
  completedAt?: string | null;
  total: MetricTotals;
  variations: VariationPerformance[];
  cycleWindows?: CycleWindow[];
  baselineSession?: {
    startDate: string;
    endDate: string;
  };
};

export type CampaignSummary = {
  id: string;
  name: string;
  slug: string;
  startDate: string;
  mode: "standard" | "restart";
  sourceCampaignId?: string | null;
};

export type UploadSummary = {
  id: string;
  sourceFile: string;
  sessionStart: string;
  sessionEnd: string;
  revision: number;
  active: boolean;
  createdAt: string;
  uploadedBy: string;
};

export type DashboardData = {
  campaign: CampaignSummary;
  campaigns: CampaignSummary[];
  cycles: CycleSummary[];
  listings: ListingPerformance[];
  uploads: UploadSummary[];
  totals: MetricTotals;
};

export type CompletionListing = {
  itemId: string;
  listingTitle: string;
  doneComplete: boolean;
  successStreak: number;
  longestSuccessStreak: number;
  readyToComplete: boolean;
  activeBaselineCycle?: number | null;
  activeBaselineOrders?: number | null;
  selectedPathStatus?: "complete" | "active" | "failed" | null;
  totalOrders: number;
  totalSales: number;
};

export type RestartCandidate = {
  itemId: string;
  listingTitle: string;
  failedCycle: number;
  failedGoal: number;
  failedOrders: number;
  baselineUploadId: string | null;
  baselineSessionStart: string | null;
  baselineSessionEnd: string | null;
  baselineOrders: number | null;
};

export type RestartPreview = {
  sourceCampaign: CampaignSummary;
  sourceCycle: number;
  candidates: RestartCandidate[];
  excluded: RestartCandidate[];
};

export type ParsedListingMetric = {
  itemId: string;
  listingTitle: string;
  confirmedSales: number;
  confirmedOrders: number;
  unitsSold: number;
  reminderClicks: number;
  impressions: number;
  clicks: number;
};

export type ParsedVariationMetric = {
  itemId: string;
  listingTitle: string;
  variationId: string;
  variationTitle: string;
  sku: string;
  confirmedSales: number;
  confirmedOrders: number;
  unitsSold: number;
};

export type ParsedFlashSaleFile = {
  sessionKey: string;
  sessionStart: string;
  sessionEnd: string;
  listings: ParsedListingMetric[];
  variations: ParsedVariationMetric[];
};
