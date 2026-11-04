import type { Dashboard } from "./assay";
import sample from "./sample.json";

import { DATA_URL } from "./urls";

export const SAMPLE = sample as Dashboard;

/** Latest rounds, cached for five minutes. Falls back to the bundled snapshot. */
export async function loadDashboard(): Promise<Dashboard> {
  try {
    const res = await fetch(DATA_URL, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Dashboard;
    if (!data.rounds?.length) throw new Error("no rounds");
    return data;
  } catch {
    return SAMPLE;
  }
}
