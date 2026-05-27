import type { AutopsyReport } from "../types.js";

export function renderJsonReport(report: AutopsyReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
