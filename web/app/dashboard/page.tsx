import type { Metadata } from "next";
import { Dashboard } from "@/components/Dashboard";
import { loadDashboard } from "@/lib/data";

export const revalidate = 300;
export const metadata: Metadata = { title: "Dashboard, Assayer" };

export default async function DashboardPage() {
  return <Dashboard initial={await loadDashboard()} />;
}
