import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { createCache } from "@/lib/cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = createCache<any>({ namespace: "metrics", ttlMs: 10 * 60 * 1000 });

const DAILY_EMAIL_TARGET = 100000;

function targetForDate(dateStr: string): number | null {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return null;
  return DAILY_EMAIL_TARGET;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || "2026-01-05";
  const to = searchParams.get("to") || new Date().toISOString().split("T")[0];

  const statsQuery = `
    SELECT
      (sent_time AT TIME ZONE 'America/Los_Angeles')::date AS date,
      COUNT(DISTINCT stats_id) AS total_sends,
      COUNT(DISTINCT stats_id) FILTER (WHERE is_bounced = true) AS total_bounced,
      ROUND(100.0 * COUNT(DISTINCT stats_id) FILTER (WHERE is_bounced = true)
        / NULLIF(COUNT(DISTINCT stats_id), 0), 2) AS bounce_rate,
      COUNT(DISTINCT LOWER(TRIM(lead_email))) FILTER (WHERE open_count >= 2) AS emails_2plus_opens,
      ROUND(100.0 * COUNT(DISTINCT LOWER(TRIM(lead_email))) FILTER (WHERE open_count >= 2)
        / NULLIF(COUNT(DISTINCT LOWER(TRIM(lead_email))), 0), 2) AS open_2plus_rate
    FROM gist.gtm_email_campaign_stats
    WHERE sent_time IS NOT NULL
      AND (sent_time AT TIME ZONE 'America/Los_Angeles')::date BETWEEN $1::date AND $2::date
      AND EXTRACT(DOW FROM (sent_time AT TIME ZONE 'America/Los_Angeles')::date) NOT IN (0, 6)
    GROUP BY 1
    ORDER BY 1 DESC
  `;

  // Scope the heavy MIN aggregation: only consider leads that had >=2 opens within the
  // requested range, then compute their first-ever >=2 date over full history. This
  // avoids the prior full-table scan.
  const noCallQuery = `
    WITH leads_in_range AS (
      SELECT DISTINCT LOWER(TRIM(lead_email)) AS norm_email
      FROM gist.gtm_email_campaign_stats
      WHERE lead_email IS NOT NULL
        AND TRIM(lead_email) <> ''
        AND COALESCE(open_count, 0) >= 2
        AND (sent_time AT TIME ZONE 'America/Los_Angeles')::date BETWEEN $1::date AND $2::date
    ),
    first_dates AS (
      SELECT
        LOWER(TRIM(s.lead_email)) AS norm_email,
        MIN((s.sent_time AT TIME ZONE 'America/Los_Angeles')::date) AS first_date
      FROM gist.gtm_email_campaign_stats s
      JOIN leads_in_range l ON LOWER(TRIM(s.lead_email)) = l.norm_email
      WHERE COALESCE(s.open_count, 0) >= 2
        AND s.sent_time IS NOT NULL
      GROUP BY 1
    )
    SELECT
      fd.first_date AS date,
      COUNT(DISTINCT fd.norm_email) AS unique_2plus_no_call
    FROM first_dates fd
    JOIN gist.gtm_smartlead_leads sl
      ON LOWER(TRIM(sl.lead_email)) = fd.norm_email
    WHERE fd.first_date BETWEEN $1::date AND $2::date
      AND sl.lead_phone_number IS NOT NULL
      AND TRIM(sl.lead_phone_number) <> ''
    GROUP BY fd.first_date
    ORDER BY fd.first_date DESC
  `;

  const callsQuery = `
    WITH smartlead_prepared AS (
      SELECT sl.lead_id, sl.updated_at, sl.inserted_at,
        CASE
          WHEN LENGTH(REGEXP_REPLACE(SPLIT_PART(COALESCE(sl.lead_phone_number, ''), ',', 1), '\\D', '', 'g')) = 10
            THEN '1' || REGEXP_REPLACE(SPLIT_PART(COALESCE(sl.lead_phone_number, ''), ',', 1), '\\D', '', 'g')
          WHEN LENGTH(REGEXP_REPLACE(SPLIT_PART(COALESCE(sl.lead_phone_number, ''), ',', 1), '\\D', '', 'g')) = 11
            AND LEFT(REGEXP_REPLACE(SPLIT_PART(COALESCE(sl.lead_phone_number, ''), ',', 1), '\\D', '', 'g'), 1) = '1'
            THEN REGEXP_REPLACE(SPLIT_PART(COALESCE(sl.lead_phone_number, ''), ',', 1), '\\D', '', 'g')
          WHEN LENGTH(REGEXP_REPLACE(SPLIT_PART(COALESCE(sl.lead_phone_number, ''), ',', 1), '\\D', '', 'g')) > 11
            THEN '1' || RIGHT(REGEXP_REPLACE(SPLIT_PART(COALESCE(sl.lead_phone_number, ''), ',', 1), '\\D', '', 'g'), 10)
          ELSE NULL
        END AS norm_phone
      FROM gist.gtm_smartlead_leads sl
    ),
    smartlead_dedup AS (
      SELECT lead_id, norm_phone FROM (
        SELECT sp.lead_id, sp.norm_phone,
          ROW_NUMBER() OVER (PARTITION BY sp.norm_phone ORDER BY sp.updated_at DESC NULLS LAST, sp.inserted_at DESC NULLS LAST) AS rn
        FROM smartlead_prepared sp WHERE sp.norm_phone IS NOT NULL
      ) t WHERE rn = 1
    ),
    calls_base AS (
      SELECT jc.call_date, jc.cost_incurred, jc.disposition,
        REGEXP_REPLACE(jc.contact_number, '\\D', '', 'g') AS norm_phone
      FROM gist.justcall_burner_email_call_logs jc
      WHERE jc.contact_number IS NOT NULL
        AND COALESCE(jc.campaign_name, '') NOT ILIKE '%meta%'
        AND COALESCE(jc.agent_name, '') NOT ILIKE '%allaine%'
        AND jc.call_date BETWEEN $1::date AND $2::date
    ),
    calls_labeled AS (
      SELECT cb.call_date, cb.cost_incurred,
        CASE WHEN sl.lead_id IS NOT NULL THEN 'burner' ELSE 'non_burner' END AS burner_flag,
        CASE WHEN cb.disposition ILIKE '%DM : Meeting Booked%' THEN 1 ELSE 0 END AS is_demo_booked
      FROM calls_base cb
      LEFT JOIN smartlead_dedup sl ON cb.norm_phone = sl.norm_phone
    )
    SELECT
      call_date,
      COUNT(*) FILTER (WHERE burner_flag = 'burner') AS burner_calls,
      COALESCE(SUM(is_demo_booked) FILTER (WHERE burner_flag = 'burner'), 0) AS burner_demos,
      COUNT(*) FILTER (WHERE burner_flag = 'non_burner') AS non_burner_calls,
      COALESCE(SUM(is_demo_booked) FILTER (WHERE burner_flag = 'non_burner'), 0) AS non_burner_demos,
      COALESCE(SUM(cost_incurred) FILTER (WHERE burner_flag = 'burner'), 0) AS burner_cost
    FROM calls_labeled
    GROUP BY call_date
    ORDER BY call_date DESC
  `;

  const uniqueOpensQuery = `
    SELECT COUNT(DISTINCT LOWER(TRIM(lead_email))) AS total_unique_2plus
    FROM gist.gtm_email_campaign_stats
    WHERE lead_email IS NOT NULL
      AND TRIM(lead_email) <> ''
      AND COALESCE(open_count, 0) >= 2
      AND (sent_time AT TIME ZONE 'America/Los_Angeles')::date BETWEEN $1::date AND $2::date
  `;

  try {
    const cacheKey = `${from}|${to}`;
    const cached = cache.get(cacheKey);
    if (cached) return NextResponse.json(cached);

    // Run all four queries in parallel — each acquires its own pooled client.
    const [statsResult, noCallResult, callsResult, uniqueOpensResult] = await Promise.all([
      pool.query(statsQuery, [from, to]),
      pool.query(noCallQuery, [from, to]),
      pool.query(callsQuery, [from, to]),
      pool.query(uniqueOpensQuery, [from, to]),
    ]);

    const totalUnique2Plus = Number(uniqueOpensResult.rows[0]?.total_unique_2plus ?? 0);

    const noCallMap: Record<string, number> = {};
    for (const r of noCallResult.rows) {
      noCallMap[String(r.date)] = Number(r.unique_2plus_no_call);
    }

    const callsMap: Record<string, {
      burner_calls: number; burner_demos: number;
      non_burner_calls: number; non_burner_demos: number;
      burner_cost: number;
    }> = {};
    for (const r of callsResult.rows) {
      callsMap[String(r.call_date)] = {
        burner_calls: Number(r.burner_calls),
        burner_demos: Number(r.burner_demos),
        non_burner_calls: Number(r.non_burner_calls),
        non_burner_demos: Number(r.non_burner_demos),
        burner_cost: Number(r.burner_cost),
      };
    }

    const rows = statsResult.rows.map((r) => {
      const dateStr = String(r.date);
      const totalSends = Number(r.total_sends);
      const target = targetForDate(dateStr);
      const attainment = target ? Number(((totalSends / target) * 100).toFixed(1)) : null;

      const c = callsMap[dateStr] ?? { burner_calls: 0, burner_demos: 0, non_burner_calls: 0, non_burner_demos: 0, burner_cost: 0 };

      const demoCallRateBurner = c.burner_calls > 0
        ? Number(((c.burner_demos / c.burner_calls) * 100).toFixed(2)) : 0;
      const demoCallRateNonBurner = c.non_burner_calls > 0
        ? Number(((c.non_burner_demos / c.non_burner_calls) * 100).toFixed(2)) : 0;

      const liftFromBurner = demoCallRateNonBurner > 0
        ? Number((((demoCallRateBurner - demoCallRateNonBurner) / demoCallRateNonBurner) * 100).toFixed(2)) : 0;

      const ifNoBurner = c.burner_calls > 0
        ? Math.round((demoCallRateNonBurner / 100) * c.burner_calls) : 0;

      const difference = c.burner_demos - ifNoBurner;

      return {
        date: dateStr,
        emails_sent: totalSends,
        target_emails_sent: target,
        attainment,
        bounce_rate: Number(r.bounce_rate),
        emails_2plus_opens: Number(r.emails_2plus_opens),
        open_2plus_rate: Number(r.open_2plus_rate),
        unique_2plus_no_call: noCallMap[dateStr] ?? 0,
        calls_burner: c.burner_calls,
        demos_burner: c.burner_demos,
        demo_call_rate_burner: demoCallRateBurner,
        calls_non_burner: c.non_burner_calls,
        demos_non_burner: c.non_burner_demos,
        demo_call_rate_non_burner: demoCallRateNonBurner,
        lift_from_burner: liftFromBurner,
        if_no_burner: ifNoBurner,
        difference,
      };
    });

    const result = { rows, totalUnique2Plus };
    cache.set(cacheKey, result);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
