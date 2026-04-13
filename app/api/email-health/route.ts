import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  const client = await pool.connect();
  try {
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");

    // Summary metrics
    const summary = await client.query(`
      WITH base AS (
        SELECT * FROM gist.burner_email_health
        WHERE custom_tracking_domain NOT LIKE '%gush%'
      ),
      inbox_metrics AS (
        SELECT
          custom_tracking_domain,
          CASE
            WHEN daily_sent_count >= message_per_day
                 AND message_per_day IS NOT NULL
            THEN 1 ELSE 0
          END AS is_at_capacity,
          warmup_reputation
        FROM base
      ),
      domain_metrics AS (
        SELECT
          custom_tracking_domain,
          COUNT(*) AS total_inboxes,
          SUM(is_at_capacity) AS inboxes_at_capacity,
          AVG(warmup_reputation) AS avg_reputation
        FROM inbox_metrics
        GROUP BY custom_tracking_domain
      )
      SELECT
        (SELECT COUNT(*) FROM base) AS total_inboxes,
        (SELECT SUM(is_at_capacity) FROM inbox_metrics) AS inboxes_used_to_capacity,
        (SELECT COUNT(*) FROM domain_metrics WHERE custom_tracking_domain != '') AS total_domains,
        (SELECT COUNT(*) FROM domain_metrics WHERE inboxes_at_capacity > 0) AS domains_used_to_capacity,
        (SELECT COUNT(*) FROM domain_metrics WHERE avg_reputation >= 90) AS domains_above_reputation
    `);

    // Domain-level breakdown
    const domains = await client.query(`
      WITH base AS (
        SELECT * FROM gist.burner_email_health
        WHERE custom_tracking_domain NOT LIKE '%gush%'
          AND custom_tracking_domain != ''
      ),
      inbox_metrics AS (
        SELECT
          custom_tracking_domain,
          CASE
            WHEN daily_sent_count >= message_per_day
                 AND message_per_day IS NOT NULL
            THEN 1 ELSE 0
          END AS is_at_capacity,
          warmup_reputation,
          daily_sent_count,
          message_per_day
        FROM base
      )
      SELECT
        custom_tracking_domain AS domain,
        COUNT(*) AS total_inboxes,
        SUM(is_at_capacity) AS inboxes_at_capacity,
        ROUND(AVG(warmup_reputation)::numeric, 1) AS avg_reputation,
        SUM(daily_sent_count) AS total_daily_sent,
        SUM(message_per_day) AS total_capacity
      FROM inbox_metrics
      GROUP BY custom_tracking_domain
      ORDER BY COUNT(*) DESC, custom_tracking_domain
    `);

    // Inbox-level breakdown
    const inboxes = await client.query(`
      SELECT
        email_account_id,
        custom_tracking_domain AS domain,
        message_per_day,
        daily_sent_count,
        warmup_reputation,
        warmup_status,
        CASE
          WHEN daily_sent_count >= message_per_day
               AND message_per_day IS NOT NULL
          THEN true ELSE false
        END AS at_capacity
      FROM gist.burner_email_health
      WHERE custom_tracking_domain NOT LIKE '%gush%'
        AND custom_tracking_domain != ''
      ORDER BY custom_tracking_domain, email_account_id
    `);

    const s = summary.rows[0];

    return NextResponse.json({
      summary: {
        total_inboxes: Number(s.total_inboxes),
        inboxes_used_to_capacity: Number(s.inboxes_used_to_capacity),
        total_domains: Number(s.total_domains),
        domains_used_to_capacity: Number(s.domains_used_to_capacity),
        domains_above_reputation: Number(s.domains_above_reputation),
      },
      domains: domains.rows.map((r) => ({
        domain: r.domain,
        total_inboxes: Number(r.total_inboxes),
        inboxes_at_capacity: Number(r.inboxes_at_capacity),
        avg_reputation: Number(r.avg_reputation),
        total_daily_sent: Number(r.total_daily_sent),
        total_capacity: Number(r.total_capacity),
      })),
      inboxes: inboxes.rows.map((r) => ({
        email_account_id: Number(r.email_account_id),
        domain: r.domain,
        message_per_day: r.message_per_day ? Number(r.message_per_day) : null,
        daily_sent_count: Number(r.daily_sent_count),
        warmup_reputation: r.warmup_reputation ? Number(r.warmup_reputation) : null,
        warmup_status: r.warmup_status,
        at_capacity: r.at_capacity,
      })),
    });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
