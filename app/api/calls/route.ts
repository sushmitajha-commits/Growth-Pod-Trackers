import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  const client = await pool.connect();
  try {
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");

    const result = await client.query(`
      WITH daily_logs AS (
        SELECT
          ((call_date::text || ' ' || call_time::text)::timestamp - interval '4 hours')::date AS date,
          COUNT(*)                                                            AS total_calls,
          SUM(CASE WHEN campaign_id IS NOT NULL THEN 1 ELSE 0 END)           AS sales_dialer_calls,
          SUM(CASE WHEN campaign_id IS NULL     THEN 1 ELSE 0 END)           AS justcall_calls,
          COUNT(DISTINCT contact_number)                                      AS unique_dials,
          SUM(CASE WHEN disposition IN ('Qualified : DM : Meeting Booked', 'Qualified: DM : Meeting Booked') THEN 1 ELSE 0 END) AS demos
        FROM gist.justcall_burner_email_call_logs
        WHERE campaign_name NOT ILIKE '%meta%'
          AND ((call_date::text || ' ' || call_time::text)::timestamp - interval '4 hours')::date >= DATE_TRUNC('month', CURRENT_DATE)::date
        GROUP BY 1
      )
      SELECT
        date,
        total_calls,
        SUM(total_calls) OVER (
          PARTITION BY DATE_TRUNC('month', date)
          ORDER BY date
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS calls_mtd,
        100000 AS target,
        ROUND(
          SUM(total_calls) OVER (
            PARTITION BY DATE_TRUNC('month', date)
            ORDER BY date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          )::numeric / 100000 * 100, 2
        ) AS attainment,
        sales_dialer_calls,
        justcall_calls,
        unique_dials,
        demos
      FROM daily_logs
      WHERE date < CURRENT_DATE
      ORDER BY date DESC
    `);

    const rows = result.rows.map((r) => ({
      date: String(r.date),
      total_calls: Number(r.total_calls),
      calls_mtd: Number(r.calls_mtd),
      target: Number(r.target),
      attainment: r.attainment ? Number(r.attainment) : 0,
      sales_dialer_calls: Number(r.sales_dialer_calls),
      justcall_calls: Number(r.justcall_calls),
      unique_dials: Number(r.unique_dials),
      demos: Number(r.demos),
    }));

    return NextResponse.json({ rows });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
