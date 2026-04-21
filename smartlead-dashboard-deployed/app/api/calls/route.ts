import { NextResponse } from "next/server";
import pool from "@/lib/db";

// Showup targets for April (22 working days, target = 250, index 0 = day 1)
const SHOWUP_TARGETS = Array.from({ length: 22 }, (_, i) => Math.round((250 / 22) * (i + 1)));

// Demo plan targets for April (22 working days, target = 550)
const DEMO_PLAN_TARGETS = Array.from({ length: 22 }, (_, i) => Math.round((550 / 22) * (i + 1)));

// New contacts loaded: hardcoded Apr 1–14
const NEW_CONTACTS_MAP: Record<string, number> = {
  "2026-04-01": 4758,
  "2026-04-02": 3498,
  "2026-04-03": 2498,
  "2026-04-06": 2883,
  "2026-04-07": 3397,
  "2026-04-08": 3100,
  "2026-04-09": 3100,
  "2026-04-10": 3100,
  "2026-04-13": 3100,
  "2026-04-14": 2958,
  "2026-04-15": 2248,
  "2026-04-16": 1724,
  "2026-04-17": 3081,
  "2026-04-18": 3393,
};

const MONTHLY_MAX_CONTACTS = 79000;
const SHOWUP_PLAN = 250;
const TOTAL_WORKING_DAYS = 22;

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
          SUM(CASE WHEN disposition ILIKE '%DM : Meeting Booked%' THEN 1 ELSE 0 END) AS demos
        FROM gist.justcall_burner_email_call_logs
        WHERE COALESCE(campaign_name, '') NOT ILIKE '%meta%'
          AND COALESCE(agent_name, '') NOT ILIKE '%allaine%'
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
        AND EXTRACT(DOW FROM date) NOT IN (0, 6)
      ORDER BY date DESC
    `);

    // Showups from sybill_meetings
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

    // Demos scheduled: hardcoded until Apr 13, DB from Apr 14
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
        COUNT(DISTINCT LOWER(TRIM(account_name))) AS demos_scheduled
      FROM (
        SELECT account_name, demo_scheduled_date,
          ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(account_name)) ORDER BY demo_scheduled_date DESC) AS rn
        FROM gist.gtm_demo_bookings
        WHERE demo_scheduled_date IS NOT NULL
          AND demo_scheduled_date::date >= '2026-04-14'
          AND demo_scheduled_date::date < CURRENT_DATE
      ) t WHERE rn = 1
      GROUP BY 1
      ORDER BY 1
    `);
    for (const r of demosScheduledResult.rows) {
      demosScheduledMap[String(r.date)] = Number(r.demos_scheduled);
    }

    // Sort ascending to calculate running totals
    const sortedForMtd = [...result.rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let showupsMtd = 0;
    let uniqueContactsMtd = 0;
    let demosScheduledMtd = 0;
    let dayIndex = 0;

    const computedMap: Record<string, {
      showups: number; showups_mtd: number; showup_target: number;
      new_contacts: number; unique_contacts_mtd: number;
      demos_scheduled_mtd: number; demo_plan: number;
      working_days_gone: number; pct_working_days: number;
    }> = {};

    for (const r of sortedForMtd) {
      const dateStr = String(r.date);
      const dayShowups = showupsMap[dateStr] ?? 0;
      showupsMtd += dayShowups;

      const newContacts = NEW_CONTACTS_MAP[dateStr] ?? 0;
      uniqueContactsMtd += Number(r.unique_dials);

      const dayDemosScheduled = demosScheduledMap[dateStr] ?? 0;
      demosScheduledMtd += dayDemosScheduled;

      const showupTarget = SHOWUP_TARGETS[dayIndex] ?? SHOWUP_TARGETS[SHOWUP_TARGETS.length - 1];
      const demoPlan = DEMO_PLAN_TARGETS[dayIndex] ?? DEMO_PLAN_TARGETS[DEMO_PLAN_TARGETS.length - 1];
      const workingDaysGone = dayIndex + 1;

      computedMap[dateStr] = {
        showups: dayShowups,
        showups_mtd: showupsMtd,
        showup_target: showupTarget,
        new_contacts: newContacts,
        unique_contacts_mtd: uniqueContactsMtd,
        demos_scheduled_mtd: demosScheduledMtd,
        demo_plan: demoPlan,
        working_days_gone: workingDaysGone,
        pct_working_days: Number(((workingDaysGone / TOTAL_WORKING_DAYS) * 100).toFixed(1)),
      };
      dayIndex++;
    }

    const rows = result.rows.map((r) => {
      const dateStr = String(r.date);
      const c = computedMap[dateStr] ?? {
        showups: 0, showups_mtd: 0, showup_target: 0,
        new_contacts: 0, unique_contacts_mtd: 0,
        demos_scheduled_mtd: 0, demo_plan: 0,
        working_days_gone: 0, pct_working_days: 0,
      };
      const totalCalls = Number(r.total_calls);
      const demos = Number(r.demos);
      const demosScheduled = demosScheduledMap[dateStr] ?? 0;

      return {
        date: dateStr,
        total_calls: totalCalls,
        calls_mtd: Number(r.calls_mtd),
        target: Number(r.target),
        attainment: r.attainment ? Number(r.attainment) : 0,
        sales_dialer_calls: Number(r.sales_dialer_calls),
        justcall_calls: Number(r.justcall_calls),
        unique_dials: Number(r.unique_dials),
        new_contacts: c.new_contacts,
        unique_contacts_mtd: c.unique_contacts_mtd,
        monthly_max_contacts: MONTHLY_MAX_CONTACTS,
        pct_contacts_used: Number(((c.unique_contacts_mtd / MONTHLY_MAX_CONTACTS) * 100).toFixed(2)),
        demos: demos,
        demos_scheduled: demosScheduled,
        demos_scheduled_mtd: c.demos_scheduled_mtd,
        demo_plan: 550,
        demo_attainment: Number(((c.demos_scheduled_mtd / 550) * 100).toFixed(2)),
        demo_to_call_rate: totalCalls > 0
          ? Number(((demos / totalCalls) * 100).toFixed(2)) : 0,
        showup_rate: demosScheduled > 0
          ? Number(((c.showups / demosScheduled) * 100).toFixed(2)) : 0,
        showups: c.showups,
        showups_mtd: c.showups_mtd,
        showup_target: c.showup_target,
        showup_plan: SHOWUP_PLAN,
        showup_attainment: Number(((c.showups_mtd / SHOWUP_PLAN) * 100).toFixed(2)),
        working_days_gone: c.working_days_gone,
        pct_working_days: c.pct_working_days,
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
