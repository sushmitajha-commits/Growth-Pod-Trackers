import { NextRequest, NextResponse } from "next/server";
import { GET as callsGET } from "../calls/route";
import { GET as aeTrackerGET } from "../ae-tracker/route";
import { GET as metricsGET } from "../metrics/route";
import { GET as outboundCostGET } from "../outbound-cost/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteHandler = (req: NextRequest) => Promise<Response>;

const ROUTES: { name: string; handler: RouteHandler }[] = [
  { name: "calls", handler: callsGET as RouteHandler },
  { name: "ae-tracker", handler: aeTrackerGET as RouteHandler },
  { name: "metrics", handler: metricsGET as RouteHandler },
  { name: "outbound-cost", handler: outboundCostGET as RouteHandler },
];

function closedMonthsFrom(start: string): { from: string; to: string; label: string }[] {
  const now = new Date();
  const months: { from: string; to: string; label: string }[] = [];
  const [startYear, startMonth] = start.split("-").map(Number);
  let year = startYear;
  let month = startMonth;
  while (year < now.getFullYear() || (year === now.getFullYear() && month - 1 < now.getMonth())) {
    const mm = String(month).padStart(2, "0");
    const lastDay = new Date(year, month, 0).getDate();
    months.push({
      from: `${year}-${mm}-01`,
      to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
      label: `${year}-${mm}`,
    });
    month++;
    if (month > 12) { month = 1; year++; }
  }
  return months;
}

async function prewarmOne(routeName: string, handler: RouteHandler, from: string, to: string) {
  const start = Date.now();
  try {
    const url = new URL(`http://localhost/api/${routeName}?from=${from}&to=${to}`);
    const req = new NextRequest(url);
    const res = await handler(req);
    return { ok: res.status < 400, status: res.status, ms: Date.now() - start };
  } catch (err) {
    return { ok: false, status: 500, ms: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const startMonth = searchParams.get("from") || "2026-01";
  const months = closedMonthsFrom(`${startMonth}-01`);

  type Result = { month: string; route: string; ok: boolean; status: number; ms: number; error?: string };
  const results: Result[] = [];

  for (const { from, to, label } of months) {
    const batch = await Promise.all(
      ROUTES.map(async ({ name, handler }) => {
        const r = await prewarmOne(name, handler, from, to);
        return { month: label, route: name, ...r };
      })
    );
    results.push(...batch);
  }

  return NextResponse.json({
    months: months.map(m => m.label),
    routes: ROUTES.map(r => r.name),
    results,
    summary: {
      total: results.length,
      ok: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      total_ms: results.reduce((s, r) => s + r.ms, 0),
    },
  });
}
