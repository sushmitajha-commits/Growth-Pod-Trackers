import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

const TARGETS: Record<string, number> = {
  "2025-03-30": 100000, "2025-03-31": 101000,
  "2025-04-01": 102010, "2025-04-02": 103030, "2025-04-03": 104060,
  "2025-04-06": 105101, "2025-04-07": 106152, "2025-04-08": 137998,
  "2025-04-09": 142138, "2025-04-10": 143559, "2025-04-13": 144995,
  "2025-04-14": 146444, "2025-04-15": 147909, "2025-04-16": 149388,
  "2025-04-17": 149388, "2025-04-20": 149388, "2025-04-21": 149388,
  "2025-04-22": 149388, "2025-04-23": 149388, "2025-04-24": 149388,
  "2025-04-27": 149388, "2025-04-28": 149388, "2025-04-29": 149388,
  "2025-04-30": 149388, "2025-05-01": 149388, "2025-05-04": 149388,
  "2025-05-05": 149388, "2025-05-06": 149388, "2025-05-07": 149388,
  "2025-05-08": 149388, "2025-05-11": 149388, "2025-05-12": 149388,
  "2025-05-13": 149388, "2025-05-14": 149388, "2025-05-15": 149388,
  "2025-05-18": 149388, "2025-05-19": 149388, "2025-05-20": 149388,
  "2025-05-21": 149388, "2025-05-22": 149388, "2025-05-25": 149388,
  "2025-05-26": 149388, "2025-05-27": 149388, "2025-05-28": 149388,
  "2025-05-29": 149388, "2025-06-01": 149388, "2025-06-02": 149388,
  "2025-06-03": 149388, "2025-06-04": 149388, "2025-06-05": 149388,
  "2025-06-08": 149388, "2025-06-09": 149388, "2025-06-10": 149388,
  "2025-06-11": 149388, "2025-06-12": 149388, "2025-06-15": 149388,
  "2025-06-16": 149388, "2025-06-17": 149388, "2025-06-18": 149388,
  "2025-06-19": 149388, "2025-06-22": 149388, "2025-06-23": 149388,
  "2025-06-24": 149388, "2025-06-25": 149388, "2025-06-26": 149388,
  "2025-06-29": 149388, "2025-06-30": 149388, "2025-07-01": 149388,
  "2025-07-02": 149388, "2025-07-03": 149388, "2025-07-06": 149388,
  "2025-07-07": 149388, "2025-07-08": 149388, "2025-07-09": 149388,
  "2025-07-10": 149388, "2025-07-13": 149388, "2025-07-14": 149388,
  "2025-07-15": 149388, "2025-07-16": 149388, "2025-07-17": 149388,
  "2025-07-20": 149388, "2025-07-21": 149388, "2025-07-22": 149388,
  "2025-07-23": 149388, "2025-07-24": 149388, "2025-07-27": 149388,
  "2025-07-28": 149388, "2025-07-29": 149388, "2025-07-30": 149388,
  "2025-07-31": 149388, "2025-08-03": 149388, "2025-08-04": 149388,
  "2025-08-05": 149388, "2025-08-06": 149388, "2025-08-07": 149388,
};
for (const [k, v] of Object.entries({ ...TARGETS })) {
  TARGETS[k.replace("2025-", "2026-")] = v;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || "2026-01-05";
  const to = searchParams.get("to") || new Date().toISOString().split("T")[0];

  const client = await pool.connect();
  try {
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");

    // 1) Campaign stats per day (Pacific Time — captures full EST+PST business day)
    const statsResult = await client.query(
      `
      WITH base AS (
        SELECT
          stats_id,
          email_campaign_seq_id,
          LOWER(TRIM(lead_email)) AS lead_email,
          sent_time,
          open_count,
          reply_time,
          is_bounced
        FROM gist.gtm_email_campaign_stats
        WHERE sent_time IS NOT NULL
          AND (sent_time AT TIME ZONE 'America/Los_Angeles')::date >= $1::date
          AND (sent_time AT TIME ZONE 'America/Los_Angeles')::date <= $2::date
      )
      SELECT
        (sent_time AT TIME ZONE 'America/Los_Angeles')::date AS date,
        COUNT(DISTINCT stats_id) AS total_sends,
        COUNT(DISTINCT stats_id) FILTER (WHERE is_bounced = true) AS total_bounced,
        ROUND(100.0 * COUNT(DISTINCT stats_id) FILTER (WHERE is_bounced = true)
          / NULLIF(COUNT(DISTINCT stats_id), 0), 2) AS bounce_rate,
        COUNT(DISTINCT lead_email) FILTER (WHERE open_count >= 2) AS emails_2plus_opens,
        ROUND(100.0 * COUNT(DISTINCT lead_email) FILTER (WHERE open_count >= 2)
          / NULLIF(COUNT(DISTINCT lead_email), 0), 2) AS open_2plus_rate
      FROM base
      GROUP BY 1
      ORDER BY 1 DESC
      `,
      [from, to]
    );

    // 2) First-time >=2 opens: leads whose first ever >=2 open falls on that day, with a phone number
    const noCallResult = await client.query(
      `
      WITH all_opens AS (
        SELECT
          LOWER(TRIM(lead_email)) AS norm_email,
          (sent_time AT TIME ZONE 'America/Los_Angeles')::date AS date,
          COALESCE(open_count, 0) AS open_count
        FROM gist.gtm_email_campaign_stats
        WHERE lead_email IS NOT NULL
          AND TRIM(lead_email) <> ''
          AND sent_time IS NOT NULL
      ),
      first_2plus_date AS (
        SELECT
          norm_email,
          MIN(date) AS first_date
        FROM all_opens
        WHERE open_count >= 2
        GROUP BY norm_email
      )
      SELECT
        f.first_date AS date,
        COUNT(DISTINCT f.norm_email) AS unique_2plus_no_call
      FROM first_2plus_date f
      JOIN gist.gtm_smartlead_leads sl
        ON LOWER(TRIM(sl.lead_email)) = f.norm_email
      WHERE f.first_date >= $1::date
        AND f.first_date <= $2::date
        AND sl.lead_phone_number IS NOT NULL
        AND TRIM(sl.lead_phone_number) <> ''
      GROUP BY f.first_date
      ORDER BY f.first_date DESC
      `,
      [from, to]
    );

    // 3) Email health snapshot
    const healthResult = await client.query(`
      WITH base AS (
        SELECT * FROM gist.burner_email_health
        WHERE custom_tracking_domain NOT LIKE '%gush%'
      ),
      inbox_metrics AS (
        SELECT custom_tracking_domain,
          CASE WHEN daily_sent_count >= message_per_day AND message_per_day IS NOT NULL THEN 1 ELSE 0 END AS is_at_capacity,
          warmup_reputation
        FROM base
      ),
      domain_metrics AS (
        SELECT custom_tracking_domain, COUNT(*) AS total_inboxes,
          SUM(is_at_capacity) AS inboxes_at_capacity, AVG(warmup_reputation) AS avg_reputation
        FROM inbox_metrics GROUP BY custom_tracking_domain
      )
      SELECT
        (SELECT SUM(is_at_capacity) FROM inbox_metrics) AS inboxes_at_capacity,
        (SELECT COUNT(*) FROM domain_metrics WHERE inboxes_at_capacity > 0) AS domains_at_capacity,
        (SELECT COUNT(*) FROM domain_metrics WHERE avg_reputation >= 90) AS domains_above_reputation
    `);

    // 4) Burner vs Non-Burner calls + demos (phone-based join, excludes Meta campaigns)
    const callsResult = await client.query(
      `
      WITH smartlead_prepared AS (
        SELECT sl.*,
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
        SELECT * FROM (
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
          AND jc.campaign_name NOT ILIKE '%meta%'
          AND jc.call_date >= $1::date AND jc.call_date <= $2::date
      ),
      calls_labeled AS (
        SELECT cb.call_date, cb.cost_incurred,
          CASE WHEN sl.lead_id IS NOT NULL THEN 'burner' ELSE 'non_burner' END AS burner_flag,
          CASE WHEN COALESCE(cb.disposition, '') IN ('Qualified : DM : Meeting Booked', 'Qualified: DM : Meeting Booked') THEN 1 ELSE 0 END AS is_demo_booked
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
      `,
      [from, to]
    );

    // 5) Total unique leads with >2 opens across entire date range (for summary card)
    const uniqueOpensResult = await client.query(
      `
      SELECT COUNT(DISTINCT LOWER(TRIM(lead_email))) AS total_unique_2plus
      FROM gist.gtm_email_campaign_stats
      WHERE lead_email IS NOT NULL
        AND TRIM(lead_email) <> ''
        AND COALESCE(open_count, 0) >= 2
        AND (sent_time AT TIME ZONE 'America/Los_Angeles')::date >= $1::date
        AND (sent_time AT TIME ZONE 'America/Los_Angeles')::date <= $2::date
      `,
      [from, to]
    );
    const totalUnique2Plus = Number(uniqueOpensResult.rows[0]?.total_unique_2plus ?? 0);

    const health = healthResult.rows[0];

    // Build lookup maps
    const noCallMap: Record<string, number> = {};
    for (const r of noCallResult.rows) {
      noCallMap[r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date)] = Number(r.unique_2plus_no_call);
    }

    const callsMap: Record<string, {
      burner_calls: number; burner_demos: number;
      non_burner_calls: number; non_burner_demos: number;
      burner_cost: number;
    }> = {};
    for (const r of callsResult.rows) {
      const d = r.call_date instanceof Date ? r.call_date.toISOString().split("T")[0] : String(r.call_date);
      callsMap[d] = {
        burner_calls: Number(r.burner_calls),
        burner_demos: Number(r.burner_demos),
        non_burner_calls: Number(r.non_burner_calls),
        non_burner_demos: Number(r.non_burner_demos),
        burner_cost: Number(r.burner_cost),
      };
    }

    const rows = statsResult.rows.map((r) => {
      const dateStr = r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date);
      const totalSends = Number(r.total_sends);
      const target = TARGETS[dateStr] ?? null;
      const attainment = target ? Number(((totalSends / target) * 100).toFixed(1)) : null;

      const c = callsMap[dateStr] ?? { burner_calls: 0, burner_demos: 0, non_burner_calls: 0, non_burner_demos: 0, burner_cost: 0 };

      const demoCallRateBurner = c.burner_calls > 0
        ? Number(((c.burner_demos / c.burner_calls) * 100).toFixed(2)) : 0;
      const demoCallRateNonBurner = c.non_burner_calls > 0
        ? Number(((c.non_burner_demos / c.non_burner_calls) * 100).toFixed(2)) : 0;

      // Lift from Burner Email = % improvement of burner rate over non-burner rate
      const liftFromBurner = demoCallRateNonBurner > 0
        ? Number((((demoCallRateBurner - demoCallRateNonBurner) / demoCallRateNonBurner) * 100).toFixed(2)) : 0;

      // If Burner Email Was Not There = hypothetical demos at non-burner rate
      const ifNoBurner = c.burner_calls > 0
        ? Math.round((demoCallRateNonBurner / 100) * c.burner_calls) : 0;

      // Difference = actual burner demos - hypothetical
      const difference = c.burner_demos - ifNoBurner;

      // Cost Lift = burner cost / incremental demos from burner
      const costLift = difference > 0
        ? Number((c.burner_cost / difference).toFixed(2)) : 0;

      return {
        date: dateStr,
        emails_sent: totalSends,
        target_emails_sent: target,
        attainment,
        bounce_rate: Number(r.bounce_rate),
        inboxes_at_capacity: Number(health.inboxes_at_capacity) || 0,
        domains_at_capacity: Number(health.domains_at_capacity) || 0,
        domains_above_reputation: Number(health.domains_above_reputation) || 0,
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
        cost_lift: costLift,
      };
    });

    return NextResponse.json({ rows, totalUnique2Plus });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
