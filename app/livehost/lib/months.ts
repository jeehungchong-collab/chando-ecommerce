import type { ParsedSession } from "./report";

export function validMonth(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

export function groupSessionsByMonth(sessions: ParsedSession[]) {
  const months = new Map<string, ParsedSession[]>();
  for (const session of sessions) {
    const month = session.date.slice(0, 7);
    if (!validMonth(month)) throw new Error(`Invalid session date: ${session.date}`);
    const rows = months.get(month) ?? [];
    rows.push(session);
    months.set(month, rows);
  }
  return months;
}
