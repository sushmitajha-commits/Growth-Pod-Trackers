import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { createCache } from "@/lib/cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = createCache<any>({ namespace: "calls", ttlMs: 10 * 60 * 1000 });

// Per-month targets. Switched by the month of the `to` date so April still
// shows April targets when the user filters back.
type MonthCallTargets = {
  contacts: number;
  showupPlan: number;
  callTarget: number;
  demoPlan: number;
  workingDays: number;
};
const MONTHLY_CALL_TARGETS: Record<string, MonthCallTargets> = {
  "2026-04": { contacts: 79000, showupPlan: 185, callTarget: 92400, demoPlan: 463, workingDays: 22 },
  "2026-05": { contacts: 80000, showupPlan: 299, callTarget: 100000, demoPlan: 624, workingDays: 21 },
};
const DEFAULT_CALL_TARGETS: MonthCallTargets = MONTHLY_CALL_TARGETS["2026-05"];

function getMonthTargets(toDate: string): MonthCallTargets {
  const month = toDate.substring(0, 7);
  return MONTHLY_CALL_TARGETS[month] || DEFAULT_CALL_TARGETS;
}

// New contacts loaded: hardcoded Apr 1–24
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
  "2026-04-20": 3393,
  "2026-04-21": 3841,
  "2026-04-22": 1874,
  "2026-04-23": 2128,
  "2026-04-24": 1671,
};

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

    const targets = getMonthTargets(to);
    const showupTargetsArr = Array.from({ length: targets.workingDays }, (_, i) =>
      Math.round((targets.showupPlan / targets.workingDays) * (i + 1))
    );
    const demoPlanTargetsArr = Array.from({ length: targets.workingDays }, (_, i) =>
      Math.round((targets.demoPlan / targets.workingDays) * (i + 1))
    );

    // Run the three queries in parallel — each acquires its own pooled client.
    const [callsRes, showupsRes, demosRes] = await Promise.all([
      pool.query(
        `
        WITH daily_logs AS (
          SELECT
            ((call_date::text || ' ' || call_time::text)::timestamp - interval '4 hours')::date AS date,
            COUNT(*)                                                            AS total_calls,
            SUM(CASE WHEN campaign_id IS NOT NULL THEN 1 ELSE 0 END)           AS sales_dialer_calls,
            SUM(CASE WHEN campaign_id IS NULL     THEN 1 ELSE 0 END)           AS justcall_calls,
            COUNT(DISTINCT contact_number)                                      AS unique_dials,
            COUNT(DISTINCT CASE WHEN disposition ILIKE '%DM : Meeting Booked%' THEN contact_number END) AS demos
          FROM gist.justcall_burner_email_call_logs
          WHERE COALESCE(campaign_name, '') NOT ILIKE '%meta%'
            AND COALESCE(agent_name, '') NOT ILIKE '%allaine%'
            AND ((call_date::text || ' ' || call_time::text)::timestamp - interval '4 hours')::date BETWEEN $1::date AND $2::date
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
          $3::int AS target,
          ROUND(
            SUM(total_calls) OVER (
              PARTITION BY DATE_TRUNC('month', date)
              ORDER BY date
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )::numeric / $3::int * 100, 2
          ) AS attainment,
          sales_dialer_calls,
          justcall_calls,
          unique_dials,
          demos
        FROM daily_logs
        WHERE EXTRACT(DOW FROM date) NOT IN (0, 6)
        ORDER BY date DESC
        `,
        [from, to, targets.callTarget]
      ),
      pool.query(
        `
        WITH meetings_clean AS (
          SELECT to_timestamp(start_time / 1000) AS meeting_ts
          FROM gist.sybill_meetings
          WHERE start_time IS NOT NULL
            AND LOWER(title) LIKE '%digital strategy%'
        )
        SELECT DATE(meeting_ts) AS date, COUNT(*) AS showups
        FROM meetings_clean
        WHERE DATE(meeting_ts) BETWEEN $1::date AND $2::date
        GROUP BY 1
        ORDER BY 1
        `,
        [from, to]
      ),
      pool.query(
        `
        SELECT
          demo_scheduled_date::date AS date,
          COUNT(DISTINCT LOWER(TRIM(account_name))) AS demos_scheduled
        FROM gist.gtm_demo_bookings
        WHERE demo_scheduled_date IS NOT NULL
          AND demo_scheduled_date::date >= GREATEST($1::date, '2026-05-01'::date)
          AND demo_scheduled_date::date <= $2::date
        GROUP BY 1
        ORDER BY 1
        `,
        [from, to]
      ),
    ]);

    const showupsMap: Record<string, number> = {};
    for (const r of showupsRes.rows) showupsMap[String(r.date)] = Number(r.showups);

    // Demos scheduled: April 2026 hardcoded from SavvyCal CSV (ET, deduped by account+date). DB from May 1.
    const demosScheduledMap: Record<string, number> = {
      "2026-04-01": 28, "2026-04-02": 20, "2026-04-03": 13,
      "2026-04-06": 25, "2026-04-07": 20, "2026-04-08": 19,
      "2026-04-09": 20, "2026-04-10": 26, "2026-04-13": 18,
      "2026-04-14": 26, "2026-04-15": 30, "2026-04-16": 27,
      "2026-04-17": 36, "2026-04-20": 26, "2026-04-21": 31,
      "2026-04-22": 29, "2026-04-23": 30, "2026-04-24": 31,
      "2026-04-27": 22, "2026-04-28": 32, "2026-04-29": 11,
      "2026-04-30": 13,
    };
    for (const r of demosRes.rows) demosScheduledMap[String(r.date)] = Number(r.demos_scheduled);

    // Sort ascending to calculate running totals
    const sortedForMtd = [...callsRes.rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
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

      const showupTarget = showupTargetsArr[dayIndex] ?? showupTargetsArr[showupTargetsArr.length - 1];
      const demoPlan = demoPlanTargetsArr[dayIndex] ?? demoPlanTargetsArr[demoPlanTargetsArr.length - 1];
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
        pct_working_days: Number(((workingDaysGone / targets.workingDays) * 100).toFixed(1)),
      };
      dayIndex++;
    }

    const rows = callsRes.rows.map((r) => {
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
        monthly_max_contacts: targets.contacts,
        pct_contacts_used: Number(((c.unique_contacts_mtd / targets.contacts) * 100).toFixed(2)),
        demos: demos,
        demos_scheduled: demosScheduled,
        demos_scheduled_mtd: c.demos_scheduled_mtd,
        demo_plan: targets.demoPlan,
        demo_attainment: Number(((c.demos_scheduled_mtd / targets.demoPlan) * 100).toFixed(2)),
        demo_to_call_rate: totalCalls > 0
          ? Number(((demos / totalCalls) * 100).toFixed(2)) : 0,
        showup_rate: demosScheduled > 0
          ? Number(((c.showups / demosScheduled) * 100).toFixed(2)) : 0,
        showups: c.showups,
        showups_mtd: c.showups_mtd,
        showup_target: c.showup_target,
        showup_plan: targets.showupPlan,
        showup_attainment: Number(((c.showups_mtd / targets.showupPlan) * 100).toFixed(2)),
        working_days_gone: c.working_days_gone,
        pct_working_days: c.pct_working_days,
      };
    });

    const result = {
      rows,
      targets: {
        contacts: targets.contacts,
        showup_plan: targets.showupPlan,
        call_target: targets.callTarget,
        demo_plan: targets.demoPlan,
        working_days: targets.workingDays,
      },
    };
    cache.set(cacheKey, result);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
