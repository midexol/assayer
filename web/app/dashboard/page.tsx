import type { Metadata } from "next";
import { Dashboard } from "@/components/Dashboard";
import { loadDashboard } from "@/lib/data";
import { loadThesis } from "@/lib/thesis";

export const revalidate = 300;
export const metadata: Metadata = { title: "Dashboard, Assayer" };

export default async function DashboardPage() {
  const [data, thesis] = await Promise.all([loadDashboard(), loadThesis()]);
  return <Dashboard initial={data} initialThesis={thesis} />;
}
