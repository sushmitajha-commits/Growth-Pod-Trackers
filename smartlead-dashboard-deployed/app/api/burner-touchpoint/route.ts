import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

const TYPE1_IDS = [2811964, 3027655, 3082596, 3083047, 3083336, 3083390, 3083406, 3088976];
const TYPE2_IDS = [2853186, 3103304, 3103452, 3103483, 3103535, 3103585, 3103594, 3103614];
const TYPE3_IDS = [2902041, 3170652, 3170697, 3170717];
const ALL_IDS = [...TYPE1_IDS, ...TYPE2_IDS, ...TYPE3_IDS];

// Historical snapshot dates to compute
const SNAPSHOT_DATES = ["2026-03-30", "2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeSnapshot(client: any, asOf: string) {
  const { rows } = await client.query(
    `
    SELECT
      LOWER(TRIM(lead_email)) AS email,
      MAX(CASE WHEN campaign_id = ANY($1::bigint[]) AND sent_time IS NOT NULL AND sent_time <= ($5::date + interval '1 day') THEN sequence_number ELSE 0 END) AS t1,
      MAX(CASE WHEN campaign_id = ANY($2::bigint[]) AND sent_time IS NOT NULL AND sent_time <= ($5::date + interval '1 day') THEN sequence_number ELSE 0 END) AS t2,
      MAX(CASE WHEN campaign_id = ANY($3::bigint[]) AND sent_time IS NOT NULL AND sent_time <= ($5::date + interval '1 day') THEN sequence_number ELSE 0 END) AS t3,
      MAX(CASE WHEN sent_time IS NOT NULL AND sent_time <= ($5::date + interval '1 day') THEN COALESCE(open_count, 0) ELSE 0 END) AS max_opens,
      bool_or(reply_time IS NOT NULL AND reply_time <= ($5::date + interval '1 day')) AS has_replied,
      bool_or(COALESCE(is_bounced, false) AND (sent_time IS NULL OR sent_time <= ($5::date + interval '1 day'))) AS has_bounced,
      bool_or(COALESCE(is_unsubscribed, false) AND (sent_time IS NULL OR sent_time <= ($5::date + interval '1 day'))) AS has_unsubscribed,
      bool_or(lead_category ILIKE '%do not contact%' OR lead_category ILIKE '%dnc%') AS is_dnc,
      bool_or(lead_category ILIKE '%not interested%') AS is_not_interested,
      bool_or(lead_category ILIKE '%wrong person%') AS is_wrong_person
    FROM gist.gtm_email_campaign_stats
    WHERE campaign_id = ANY($4::bigint[])
      AND lead_email IS NOT NULL AND TRIM(lead_email) <> ''
      AND (sent_time IS NULL OR sent_time <= ($5::date + interval '1 day'))
    GROUP BY LOWER(TRIM(lead_email))
    `,
    [TYPE1_IDS, TYPE2_IDS, TYPE3_IDS, ALL_IDS, asOf]
  );

  const stages = new Array(13).fill(0);
  const blocked = {
    replied: 0, bounced: 0, unsubscribed: 0,
    dnc: 0, notInterested: 0, wrongPerson: 0, opens2Plus: 0,
  };

  for (const r of rows) {
    const stage = Math.min(Number(r.t1) + Number(r.t2) + Number(r.t3), 12);

    if (r.has_replied) blocked.replied++;
    else if (r.has_bounced) blocked.bounced++;
    else if (r.has_unsubscribed) blocked.unsubscribed++;
    else if (r.is_dnc) blocked.dnc++;
    else if (r.is_not_interested) blocked.notInterested++;
    else if (r.is_wrong_person) blocked.wrongPerson++;
    else if (Number(r.max_opens) >= 2) blocked.opens2Plus++;
    else stages[stage]++;
  }

  const reachableSubtotal = stages.reduce((a, b) => a + b, 0);
  const blockedSubtotal = Object.values(blocked).reduce((a: number, b: number) => a + b, 0);
  const universe = reachableSubtotal + blockedSubtotal;

  let totalEmailsToSend = 0;
  for (let i = 0; i <= 12; i++) {
    totalEmailsToSend += stages[i] * (12 - i);
  }

  const d = new Date(asOf + "T00:00:00");
  const label = `${d.getMonth() + 1}/${d.getDate()}`;

  return {
    label, universe, stages, reachableSubtotal,
    blocked, blockedSubtotal, totalEmailsToSend, grandTotal: universe,
  };
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 600000");

    const { searchParams } = new URL(req.url);
    const singleDate = searchParams.get("date");

    if (singleDate) {
      // Compute a single snapshot for the requested date
      const snapshot = await computeSnapshot(client, singleDate);
      return NextResponse.json(snapshot);
    }

    // Compute all historical snapshots + today
    const today = new Date().toISOString().split("T")[0];
    const dates = [...SNAPSHOT_DATES, today];

    const snapshots = [];
    for (const d of dates) {
      snapshots.push(await computeSnapshot(client, d));
    }

    return NextResponse.json({ snapshots });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
