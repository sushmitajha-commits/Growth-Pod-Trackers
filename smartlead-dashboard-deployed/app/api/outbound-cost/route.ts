import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { createCache } from "@/lib/cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = createCache<any>({ namespace: "outbound-cost", ttlMs: 10 * 60 * 1000 });

export const dynamic = "force-dynamic";

function defaultFrom() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || defaultFrom();
  const to = searchParams.get("to") || new Date().toISOString().split("T")[0];

  try {
    const cacheKey = `${from}|${to}`;
    const cached = cache.get(cacheKey);
    if (cached) return NextResponse.json(cached);

    const res = await pool.query(
      `
      WITH base AS (
        SELECT
          user_email,
          start_time,
          duration_seconds,
          -- Friday week start
          DATE_TRUNC('week', start_time + INTERVAL '3 days') - INTERVAL '3 days' AS week_start,
          DATE_TRUNC('month', start_time) AS month_start
        FROM gist.clockify_time_entries
      ),
      hours AS (
        SELECT
          user_email,
          -- Payroll period logic
          CASE
            WHEN week_start < month_start THEN month_start
            ELSE week_start
          END AS payroll_start,
          ROUND(SUM(duration_seconds) / 3600.0, 2) AS hours_logged
        FROM base
        GROUP BY 1, 2
      ),
      sdrs AS (
        SELECT DISTINCT ON (LOWER(TRIM("Official_Email")))
          LOWER(TRIM("Official_Email")) AS email,
          COALESCE(NULLIF("Real_Name", ''), "Name") AS real_name,
          "Current_Status",
          CAST(REGEXP_REPLACE("Pay_Scale__hr_", '[^0-9.]', '', 'g') AS NUMERIC) AS hourly_rate
        FROM airbyte_ingestion.sdr_info_sdr
        ORDER BY LOWER(TRIM("Official_Email")), CASE WHEN "Current_Status" = 'Active' THEN 0 ELSE 1 END
      )
      SELECT
        h.user_email,
        s.real_name AS name,
        h.payroll_start::date AS week_start,
        h.hours_logged,
        CASE
          WHEN s.real_name ILIKE '%Michelle%' THEN LEAST(h.hours_logged, 45)
          ELSE LEAST(h.hours_logged, 40)
        END AS capped_hours,
        s.hourly_rate,
        ROUND(
          CASE
            WHEN s.real_name ILIKE '%Michelle%' THEN LEAST(h.hours_logged, 45)
            ELSE LEAST(h.hours_logged, 40)
          END * s.hourly_rate,
          2
        ) AS weekly_payout
      FROM hours h
      JOIN sdrs s ON LOWER(TRIM(h.user_email)) = s.email
      WHERE h.payroll_start::date >= $1::date
        AND h.payroll_start::date <= $2::date
      ORDER BY h.payroll_start DESC, s.real_name ASC;
      `,
      [from, to]
    );

    const result = { rows: res.rows };
    cache.set(cacheKey, result);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
