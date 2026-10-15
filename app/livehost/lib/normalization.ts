import type { ParsedSession } from "./report";

const goldenSlots = new Set([
  "Campaign peak date", "Late night peak start", "Night peak start", "Noon peak start",
]);

export function normalizePerformance(sessions: ParsedSession[], start = "", end = "") {
  const selected = sessions.filter((s) => (!start || s.date >= start) && (!end || s.date <= end));
  const hosts = new Map<string, {
    name: string; goldenHours: number; normalHours: number;
    goldenGmv: number; normalGmv: number; goldenSessions: number; normalSessions: number;
    orders: number; viewers: number; completeTraffic: boolean;
  }>();
  let excluded = 0;
  let crossBoundary = 0;
  for (const s of selected) {
    if (!s.host || s.host === "Unclear" || !Number.isFinite(s.hours) || s.hours <= 0 ||
        !Number.isFinite(s.gmv) || s.gmv < 0 ||
        (!goldenSlots.has(s.timing) && s.timing !== "Off-peak start")) {
      excluded++;
      continue;
    }
    const h = hosts.get(s.host) ?? {
      name: s.host, goldenHours: 0, normalHours: 0,
      goldenGmv: 0, normalGmv: 0, goldenSessions: 0, normalSessions: 0,
      orders: 0, viewers: 0, completeTraffic: true,
    };
    if (Number.isFinite(s.orders) && s.orders >= 0 && Number.isFinite(s.views) && s.views >= 0) {
      h.orders += s.orders;
      h.viewers += s.views;
    } else {
      h.completeTraffic = false;
    }
    if (goldenSlots.has(s.timing)) {
      h.goldenHours += s.hours; h.goldenGmv += s.gmv; h.goldenSessions++;
    } else {
      h.normalHours += s.hours; h.normalGmv += s.gmv; h.normalSessions++;
    }
    if (s.peakHours > 0 && s.peakHours < s.hours - 0.000001) crossBoundary++;
    hosts.set(s.host, h);
  }
  const groups = [...hosts.values()];
  const goldenHours = groups.reduce((sum, h) => sum + h.goldenHours, 0);
  const normalHours = groups.reduce((sum, h) => sum + h.normalHours, 0);
  const goldenGmv = groups.reduce((sum, h) => sum + h.goldenGmv, 0);
  const normalGmv = groups.reduce((sum, h) => sum + h.normalGmv, 0);
  const goldenRate = goldenHours > 0 ? goldenGmv / goldenHours : null;
  const normalRate = normalHours > 0 ? normalGmv / normalHours : null;
  // A zero baseline cannot support division; do not silently substitute a multiplier.
  const multiplier = goldenRate !== null && goldenRate > 0 && normalRate !== null && normalRate > 0
    ? goldenRate / normalRate : null;
  const rows = groups.map((h) => {
    const hours = h.goldenHours + h.normalHours;
    const rawRate = (h.goldenGmv + h.normalGmv) / hours;
    const adjustedRate = multiplier === null ? null : (h.goldenGmv / multiplier + h.normalGmv) / hours;
    return { ...h, hours, rawRate, adjustedRate, goldenShare: h.goldenHours / hours,
      viewerCvr: h.completeTraffic && h.viewers > 0 ? h.orders / h.viewers * 100 : null,
      smallSample: Math.min(h.goldenSessions, h.normalSessions) < 5 };
  }).sort((a, b) => (b.adjustedRate ?? -1) - (a.adjustedRate ?? -1) || a.name.localeCompare(b.name));
  const ranked = rows.map((h) => ({ ...h,
    rank: h.adjustedRate === null ? null : 1 + rows.filter((other) => other.adjustedRate !== null && other.adjustedRate > h.adjustedRate! + 1e-9).length,
    rawRank: 1 + rows.filter((other) => other.rawRate > h.rawRate + 1e-9).length,
    nearTie: h.adjustedRate !== null && rows.some((other) => other.name !== h.name && other.adjustedRate !== null && Math.abs(other.adjustedRate - h.adjustedRate!) < 0.01),
  }));
  return { rows: ranked, multiplier, goldenRate, normalRate, excluded, crossBoundary,
    sessionCount: selected.length, goldenHours, normalHours };
}
