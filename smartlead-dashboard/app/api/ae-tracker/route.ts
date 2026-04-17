import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

const SHOWUP_TARGET = 250;
const DEMO_TARGET = 550;
const CLOSES_TARGET = 40;
const ARR_TARGET = 384000;
const TOTAL_WORKING_DAYS = 22;

export async function GET() {
  const client = await pool.connect();
  try {
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");

    // Showups per day (sybill_meetings)
    const showupsResult = await client.query(`
      SELECT
        DATE(to_timestamp(start_time / 1000)) AS date,
        COUNT(*) AS showups
      FROM gist.sybill_meetings
      WHERE start_time IS NOT NULL
        AND LOWER(title) LIKE '%digital strategy%'
        AND DATE(to_timestamp(start_time / 1000)) >= DATE_TRUNC('month', CURRENT_DATE)::date
        AND DATE(to_timestamp(start_time / 1000)) < CURRENT_DATE
      GROUP BY 1
      ORDER BY 1
    `);

    // Demos per day (demo_bookings by demo_scheduled_date)
    const demosResult = await client.query(`
      SELECT
        demo_scheduled_date::date AS date,
        COUNT(DISTINCT LOWER(TRIM(account_name))) AS demos
      FROM gist.gtm_demo_bookings
      WHERE demo_scheduled_date IS NOT NULL
        AND demo_scheduled_date::date >= DATE_TRUNC('month', CURRENT_DATE)::date
        AND demo_scheduled_date::date < CURRENT_DATE
      GROUP BY 1
      ORDER BY 1
    `);

    // Closes — outbound only (onboarding joined with all outbound domains + manual overrides)
    // Include future dates within the month
    const closesResult = await client.query(`
      WITH onboardings AS (
        SELECT
          "AE_Name" AS ae,
          LOWER(
            REGEXP_REPLACE(
              SPLIT_PART(
                REPLACE(REPLACE("Domain_Name", 'https://', ''), 'http://', ''),
                '/',
                1
              ),
              '^www\\.', ''
            )
          ) AS domain,
          TO_DATE("Onboarding_Call_Date", 'YYYY-MM-DD') AS onboarding_date,
          CAST(
            REGEXP_REPLACE("Initial_Subscription_Package_Month", '[^0-9]', '', 'g')
            AS INTEGER
          ) AS monthly_price
        FROM airbyte_ingestion."Onboarding_Tracker"
        WHERE TO_DATE("Onboarding_Call_Date", 'YYYY-MM-DD') >= DATE_TRUNC('month', CURRENT_DATE)::date
          AND TO_DATE("Onboarding_Call_Date", 'YYYY-MM-DD') < DATE_TRUNC('month', CURRENT_DATE)::date + INTERVAL '1 month'
          AND "Status" IN ('Active', 'To be Onboarded')
      ),
      email_domains AS (
        SELECT DISTINCT
          LOWER(REGEXP_REPLACE(SPLIT_PART(REPLACE(REPLACE(sl.lead_website,'https://',''),'http://',''),'/','1'),'^www\\.','')) AS domain
        FROM gist.justcall_burner_email_call_logs jc
        JOIN gist.gtm_smartlead_leads sl ON LOWER(TRIM(jc.contact_email)) = LOWER(TRIM(sl.lead_email))
        WHERE sl.lead_website IS NOT NULL
      ),
      phone_domains AS (
        SELECT DISTINCT
          LOWER(REGEXP_REPLACE(SPLIT_PART(REPLACE(REPLACE(sl.lead_website,'https://',''),'http://',''),'/','1'),'^www\\.','')) AS domain
        FROM gist.justcall_burner_email_call_logs jc
        JOIN gist.gtm_smartlead_leads sl
          ON REGEXP_REPLACE(jc.contact_number,'\\D','','g') =
            CASE
              WHEN LENGTH(REGEXP_REPLACE(SPLIT_PART(COALESCE(sl.lead_phone_number,''),',',1),'\\D','','g'))=10
                THEN '1'||REGEXP_REPLACE(SPLIT_PART(COALESCE(sl.lead_phone_number,''),',',1),'\\D','','g')
              WHEN LENGTH(REGEXP_REPLACE(SPLIT_PART(COALESCE(sl.lead_phone_number,''),',',1),'\\D','','g'))=11
                THEN REGEXP_REPLACE(SPLIT_PART(COALESCE(sl.lead_phone_number,''),',',1),'\\D','','g')
              ELSE NULL
            END
        WHERE sl.lead_website IS NOT NULL AND jc.contact_number IS NOT NULL
      ),
      booking_domains AS (
        SELECT DISTINCT
          LOWER(REGEXP_REPLACE(SPLIT_PART(REPLACE(REPLACE(COALESCE(primary_domain,website_url,''),'https://',''),'http://',''),'/','1'),'^www\\.','')) AS domain
        FROM gist.gtm_demo_bookings WHERE COALESCE(primary_domain,website_url,'') <> ''
      ),
      smartlead_domains AS (
        SELECT DISTINCT
          LOWER(REGEXP_REPLACE(SPLIT_PART(REPLACE(REPLACE(lead_website,'https://',''),'http://',''),'/','1'),'^www\\.','')) AS domain
        FROM gist.gtm_smartlead_leads WHERE lead_website IS NOT NULL AND TRIM(lead_website) <> ''
      ),
      manual_domains AS (
        SELECT unnest(ARRAY['deipower.com','thewindscreenfactory.net']) AS domain
      ),
      all_outbound AS (
        SELECT domain FROM email_domains WHERE domain <> ''
        UNION SELECT domain FROM phone_domains WHERE domain <> ''
        UNION SELECT domain FROM booking_domains WHERE domain <> ''
        UNION SELECT domain FROM smartlead_domains WHERE domain <> ''
        UNION SELECT domain FROM manual_domains
      )
      SELECT o.onboarding_date AS date, o.ae, o.domain, o.monthly_price AS price
      FROM onboardings o
      JOIN all_outbound a ON o.domain = a.domain
      ORDER BY o.onboarding_date
    `);

    // Build showups map
    const showupsMap: Record<string, number> = {};
    for (const r of showupsResult.rows) {
      showupsMap[String(r.date)] = Number(r.showups);
    }

    // Build demos map
    const demosMap: Record<string, number> = {};
    for (const r of demosResult.rows) {
      demosMap[String(r.date)] = Number(r.demos);
    }

    // Manual closes (no onboarding date in DB)
    const manualCloses = [
      { date: "2026-04-16", domain: "lasermetalfab.com", ae: "arabind.mishra@gushwork.ai", price: 400 },
    ];

    // Build closes + ARR per day
    const closesMap: Record<string, { count: number; arr: number }> = {};
    for (const r of [...closesResult.rows, ...manualCloses]) {
      const d = String(r.date);
      const price = Number(r.price) || 0;
      if (!closesMap[d]) closesMap[d] = { count: 0, arr: 0 };
      closesMap[d].count++;
      closesMap[d].arr += price * 12;
    }

    // Collect all dates
    const allDates = new Set<string>();
    for (const d of Object.keys(showupsMap)) allDates.add(d);
    for (const d of Object.keys(demosMap)) allDates.add(d);
    for (const d of Object.keys(closesMap)) allDates.add(d);

    const sortedDates = Array.from(allDates).sort();

    let showupsMtd = 0;
    let demosMtd = 0;
    let closesMtd = 0;
    let arrMtd = 0;
    let dayIndex = 0;

    const rows = sortedDates.map((date) => {
      const dayShowups = showupsMap[date] || 0;
      const dayDemos = demosMap[date] || 0;
      const dayCloses = closesMap[date]?.count || 0;
      const dayArr = closesMap[date]?.arr || 0;

      showupsMtd += dayShowups;
      demosMtd += dayDemos;
      closesMtd += dayCloses;
      arrMtd += dayArr;
      dayIndex++;

      const showupTargetTillDate = Math.round((SHOWUP_TARGET / TOTAL_WORKING_DAYS) * dayIndex);
      const demoTargetTillDate = Math.round((DEMO_TARGET / TOTAL_WORKING_DAYS) * dayIndex);
      const closesTargetTillDate = Math.round((CLOSES_TARGET / TOTAL_WORKING_DAYS) * dayIndex);
      const arrTargetTillDate = Math.round((ARR_TARGET / TOTAL_WORKING_DAYS) * dayIndex);

      return {
        date,
        showups: dayShowups,
        showups_mtd: showupsMtd,
        showup_target: SHOWUP_TARGET,
        showup_attainment: SHOWUP_TARGET > 0 ? Number(((showupsMtd / SHOWUP_TARGET) * 100).toFixed(2)) : 0,
        demos: dayDemos,
        demos_mtd: demosMtd,
        demo_target: DEMO_TARGET,
        demo_attainment: DEMO_TARGET > 0 ? Number(((demosMtd / DEMO_TARGET) * 100).toFixed(2)) : 0,
        closes: dayCloses,
        closes_mtd: closesMtd,
        closes_target_till_date: closesTargetTillDate,
        closes_target: CLOSES_TARGET,
        close_attainment: closesTargetTillDate > 0 ? Number(((closesMtd / closesTargetTillDate) * 100).toFixed(2)) : 0,
        arr: dayArr,
        arr_mtd: arrMtd,
        arr_target_till_date: arrTargetTillDate,
        arr_target: ARR_TARGET,
        arr_attainment: arrTargetTillDate > 0 ? Number(((arrMtd / arrTargetTillDate) * 100).toFixed(2)) : 0,
        working_days_gone: dayIndex,
        pct_working_days: Number(((dayIndex / TOTAL_WORKING_DAYS) * 100).toFixed(1)),
      };
    });

    return NextResponse.json({ rows: rows.reverse() });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
