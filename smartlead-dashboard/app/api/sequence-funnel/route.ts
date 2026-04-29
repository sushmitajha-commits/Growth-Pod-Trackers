import { NextResponse } from "next/server";
import pool from "@/lib/db";

const TYPE1_IDS = [2811964, 3027655, 3082596, 3083047, 3083336, 3083390, 3083406, 3088976];
const TYPE2_IDS = [2853186, 3103304, 3103452, 3103483, 3103535, 3103585, 3103594, 3103614];
const TYPE3_IDS = [2902041, 3170652, 3170697, 3170717];

const TAM = 442_631;

// Hardcoded historical weeks — these never change.
// Each row: [week_start, SQ1, SQ2, ..., SQ12]  (cumulative unique leads)
const HISTORICAL: [string, ...number[]][] = [
  ["2026-01-05", 9064, 7279, 2688, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ["2026-01-12", 14924, 11589, 8151, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ["2026-01-19", 17830, 16211, 13230, 7133, 2935, 3442, 6862, 6698, 6648, 0, 0, 0],
  ["2026-01-26", 17830, 16211, 13230, 7133, 2937, 3445, 6864, 6701, 6671, 0, 0, 0],
  ["2026-02-09", 34790, 28612, 14663, 7133, 2937, 3445, 6864, 6701, 6671, 0, 0, 0],
  ["2026-02-16", 51905, 38166, 29420, 7133, 2937, 3445, 6864, 6701, 6671, 0, 0, 0],
  ["2026-02-23", 51905, 46439, 43879, 7133, 2937, 3445, 6864, 6701, 6671, 0, 0, 0],
  ["2026-03-02", 57741, 51750, 48978, 7134, 4224, 5956, 9603, 9501, 9641, 15871, 11438, 0],
  ["2026-03-09", 100638, 80597, 62749, 7134, 4224, 5956, 9603, 9501, 9641, 26379, 20048, 14321],
  ["2026-03-16", 103865, 90791, 86504, 7134, 4224, 5956, 9603, 9501, 9641, 69651, 32301, 25291],
  ["2026-03-23", 168673, 150797, 143111, 20178, 7904, 7039, 9786, 9501, 9641, 78177, 72096, 58710],
  ["2026-03-30", 168724, 151480, 147478, 124076, 102123, 90608, 89341, 73298, 14153, 78177, 75960, 74955],
  ["2026-04-06", 270561, 247793, 219890, 141065, 132887, 128978, 122470, 108543, 88775, 78177, 75983, 75162],
  ["2026-04-13", 299760, 274213, 253783, 224943, 207563, 195298, 190686, 176146, 111817, 146986, 141058, 126629],
  ["2026-04-20", 377433, 344407, 328993, 285151, 250572, 229751, 223461, 203116, 194008, 208592, 190966, 188500],
  ["2026-04-27", 427056, 344419, 336802, 297853, 269328, 248546, 229773, 217711, 196637, 215270, 201994, 189191],
];

// Last hardcoded week end (Sunday)
const LAST_HARDCODED_SUNDAY = "2026-05-03";

// In-memory cache: avoids re-querying within the same server lifetime
let cache: { ts: number; sqs: number[] } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET() {
  try {
    // Current week start (Monday)
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const currentWeekStart = monday.toISOString().split("T")[0];

    // If we're still within the last hardcoded week, return instantly
    if (currentWeekStart <= HISTORICAL[HISTORICAL.length - 1][0]) {
      return NextResponse.json({
        tam: TAM,
        rows: HISTORICAL.map(([week, ...sqs]) => ({ week_start: week, tam: TAM, sq: sqs })),
      });
    }

    // Baseline = last hardcoded row
    const lastRow = HISTORICAL[HISTORICAL.length - 1];
    const baseline = lastRow.slice(1) as number[];

    // Check cache
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      const allRows = [
        ...HISTORICAL.map(([week, ...sqs]) => ({ week_start: week, tam: TAM, sq: sqs })),
        { week_start: currentWeekStart, tam: TAM, sq: cache.sqs },
      ];
      return NextResponse.json({ tam: TAM, rows: allRows });
    }

    // Lightweight query: only scan sends AFTER the last hardcoded Sunday.
    // Count unique leads per touchpoint in this recent window, then add baseline.
    // Leads who already received a touchpoint before the cutoff are excluded via
    // a LEFT JOIN anti-pattern scoped to only the recent + pre-cutoff partitions.
    const query = `
      WITH recent_sends AS (
        SELECT
          LOWER(TRIM(lead_email)) AS norm_email,
          CASE
            WHEN campaign_id = ANY($1::bigint[]) THEN sequence_number
            WHEN campaign_id = ANY($2::bigint[]) THEN 3 + sequence_number
            WHEN campaign_id = ANY($3::bigint[]) THEN 9 + sequence_number
            ELSE NULL
          END AS touchpoint
        FROM gist.gtm_email_campaign_stats
        WHERE sent_time IS NOT NULL
          AND lead_email IS NOT NULL AND TRIM(lead_email) <> ''
          AND (sent_time AT TIME ZONE 'America/Los_Angeles')::date > $4::date
      ),
      recent_unique AS (
        SELECT DISTINCT norm_email, touchpoint
        FROM recent_sends
        WHERE touchpoint IS NOT NULL
      ),
      prior_touches AS (
        SELECT DISTINCT
          LOWER(TRIM(lead_email)) AS norm_email,
          CASE
            WHEN campaign_id = ANY($1::bigint[]) THEN sequence_number
            WHEN campaign_id = ANY($2::bigint[]) THEN 3 + sequence_number
            WHEN campaign_id = ANY($3::bigint[]) THEN 9 + sequence_number
            ELSE NULL
          END AS touchpoint
        FROM gist.gtm_email_campaign_stats
        WHERE sent_time IS NOT NULL
          AND lead_email IS NOT NULL AND TRIM(lead_email) <> ''
          AND (sent_time AT TIME ZONE 'America/Los_Angeles')::date <= $4::date
          AND LOWER(TRIM(lead_email)) IN (SELECT norm_email FROM recent_unique)
      )
      SELECT
        r.touchpoint,
        COUNT(*) AS delta
      FROM recent_unique r
      LEFT JOIN prior_touches p
        ON r.norm_email = p.norm_email AND r.touchpoint = p.touchpoint
      WHERE p.norm_email IS NULL
      GROUP BY r.touchpoint
      ORDER BY r.touchpoint
    `;

    const { rows: dbRows } = await pool.query(query, [
      TYPE1_IDS, TYPE2_IDS, TYPE3_IDS, LAST_HARDCODED_SUNDAY,
    ]);

    const currentSqs = [...baseline];
    for (const r of dbRows) {
      const idx = Number(r.touchpoint) - 1;
      if (idx >= 0 && idx < 12) currentSqs[idx] += Number(r.delta);
    }

    // Update cache
    cache = { ts: Date.now(), sqs: currentSqs };

    const allRows = [
      ...HISTORICAL.map(([week, ...sqs]) => ({ week_start: week, tam: TAM, sq: sqs })),
      { week_start: currentWeekStart, tam: TAM, sq: currentSqs },
    ];

    return NextResponse.json({ tam: TAM, rows: allRows });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
