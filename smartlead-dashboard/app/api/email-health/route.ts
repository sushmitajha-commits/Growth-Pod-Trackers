import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    summary: {
      total_inboxes: 0,
      inboxes_used_to_capacity: 0,
      total_domains: 0,
      domains_used_to_capacity: 0,
      domains_above_reputation: 0,
    },
  });
}
