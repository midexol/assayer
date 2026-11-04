import { NextResponse } from "next/server";
import { loadDashboard } from "@/lib/data";

export const revalidate = 300;

/** Every stock and venue from the latest rounds, free. */
export async function GET() {
  return NextResponse.json(await loadDashboard());
}
