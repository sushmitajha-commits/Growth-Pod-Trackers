import { NextResponse } from "next/server";
import pool from "@/lib/db";

// Showup targets for April (22 working days, index 0 = day 1)
const SHOWUP_TARGETS = [
  11, 23, 34, 45, 57, 68, 80, 91, 102, 114,
  125, 136, 148, 159, 170, 182, 193, 205, 216, 227,
  239, 250,
];

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

    // Fetch showups from sybill_meetings (title contains 'digital strategy')
    const showupsResult = await client.query(`
      WITH meetings_clean AS (
        SELECT
          to_timestamp(start_time / 1000) AS meeting_ts
        FROM gist.sybill_meetings
        WHERE start_time IS NOT NULL
          AND LOWER(title) LIKE '%digital strategy%'
      )
      SELECT
        DATE(meeting_ts) AS date,
        COUNT(*) AS showups
      FROM meetings_clean
      WHERE DATE(meeting_ts) >= DATE_TRUNC('month', CURRENT_DATE)::date
        AND DATE(meeting_ts) < CURRENT_DATE
      GROUP BY 1
      ORDER BY 1
    `);

    const showupsMap: Record<string, number> = {};
    for (const r of showupsResult.rows) {
      showupsMap[String(r.date)] = Number(r.showups);
    }

    // Demos scheduled: hardcoded until Apr 13, DB query from Apr 14 onwards
    const demosScheduledMap: Record<string, number> = {
      "2026-04-01": 28,
      "2026-04-02": 19,
      "2026-04-03": 13,
      "2026-04-06": 24,
      "2026-04-07": 27,
      "2026-04-08": 25,
      "2026-04-09": 21,
      "2026-04-10": 28,
      "2026-04-13": 21,
    };

    const demosScheduledResult = await client.query(`
      SELECT
        demo_scheduled_date::date AS date,
        COUNT(*) AS demos_scheduled
      FROM gist.gtm_demo_bookings
      WHERE demo_scheduled_date IS NOT NULL
        AND demo_scheduled_date::date >= '2026-04-14'
        AND demo_scheduled_date::date < CURRENT_DATE
      GROUP BY 1
      ORDER BY 1
    `);
    for (const r of demosScheduledResult.rows) {
      demosScheduledMap[String(r.date)] = Number(r.demos_scheduled);
    }

    // Build rows with running showups MTD
    // First sort dates ascending to calculate MTD
    const sortedRows = [...result.rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let showupsMtd = 0;
    let dayIndex = 0;
    const mtdMap: Record<string, { showups: number; showups_mtd: number; showup_target: number }> = {};

    for (const r of sortedRows) {
      const dateStr = String(r.date);
      const dayShowups = showupsMap[dateStr] ?? 0;
      showupsMtd += dayShowups;
      const showupTarget = SHOWUP_TARGETS[dayIndex] ?? SHOWUP_TARGETS[SHOWUP_TARGETS.length - 1];
      mtdMap[dateStr] = { showups: dayShowups, showups_mtd: showupsMtd, showup_target: showupTarget };
      dayIndex++;
    }

    const rows = result.rows.map((r) => {
      const dateStr = String(r.date);
      const sm = mtdMap[dateStr] ?? { showups: 0, showups_mtd: 0, showup_target: 0 };
      return {
        date: dateStr,
        total_calls: Number(r.total_calls),
        calls_mtd: Number(r.calls_mtd),
        target: Number(r.target),
        attainment: r.attainment ? Number(r.attainment) : 0,
        sales_dialer_calls: Number(r.sales_dialer_calls),
        justcall_calls: Number(r.justcall_calls),
        unique_dials: Number(r.unique_dials),
        demos: Number(r.demos),
        demos_scheduled: demosScheduledMap[dateStr] ?? 0,
        showup_rate: (demosScheduledMap[dateStr] ?? 0) > 0
          ? Number(((sm.showups / (demosScheduledMap[dateStr] ?? 1)) * 100).toFixed(2))
          : 0,
        showups: sm.showups,
        showups_mtd: sm.showups_mtd,
        showup_target: sm.showup_target,
        showup_attainment: Number(((sm.showups_mtd / 250) * 100).toFixed(2)),
      };
    });

    return NextResponse.json({ rows });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
