import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

// Monthly targets from Growth Targets vs Actuals
const MONTHLY_TARGETS: Record<string, {
  showups: number; demos: number; closes: number; arr: number; workingDays: number;
}> = {
  "2026-04": { showups: 185, demos: 463, closes: 19, arr: 155952, workingDays: 22 },
  "2026-05": { showups: 148, demos: 370, closes: 17, arr: 141038, workingDays: 21 },
};

function getTargets() {
  const month = new Date().toISOString().substring(0, 7);
  return MONTHLY_TARGETS[month] || MONTHLY_TARGETS["2026-04"];
}

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

    // Demos scheduled per day — hardcoded Apr 1-13, DB from Apr 14 (distinct, latest per account)
    const demosScheduledHardcoded: Record<string, number> = {
      "2026-04-01": 28, "2026-04-02": 19, "2026-04-03": 13,
      "2026-04-06": 24, "2026-04-07": 27, "2026-04-08": 25,
      "2026-04-09": 21, "2026-04-10": 28, "2026-04-13": 21,
    };
    const demosResult = await client.query(`
      SELECT
        demo_scheduled_date::date AS date,
        COUNT(DISTINCT LOWER(TRIM(account_name))) AS demos
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

    // Build showups map
    const showupsMap: Record<string, number> = {};
    for (const r of showupsResult.rows) {
      showupsMap[String(r.date)] = Number(r.showups);
    }

    // Build demos map (hardcoded + DB)
    const demosMap: Record<string, number> = { ...demosScheduledHardcoded };
    for (const r of demosResult.rows) {
      demosMap[String(r.date)] = Number(r.demos);
    }

    // Outbound closes — hardcoded list (18 closes)
    const allCloses = [
      { date: "2026-04-03", price: 800 },   // M2 Antenna Systems - Arabind
      { date: "2026-04-01", price: 800 },   // Engineered Roofing Systems - Mani
      { date: "2026-04-06", price: 800 },   // CNC Programming Solutions - Abhinav
      { date: "2026-04-08", price: 1540 },  // DEI Power - Abhinav
      { date: "2026-04-08", price: 600 },   // MTS Forge - Mani
      { date: "2026-04-09", price: 1500 },  // Specgas - Ajith
      { date: "2026-04-15", price: 550 },   // Marseng - Abhinav
      { date: "2026-04-16", price: 800 },   // Windscreen Factory - Abhinav
      { date: "2026-04-14", price: 800 },   // Mansfieldec - Abhinav
      { date: "2026-04-14", price: 800 },   // ESG International - Arabind
      { date: "2026-04-20", price: 500 },   // Artesian Systems - Abhinav
      { date: "2026-04-20", price: 1000 },  // Nidra Pack - Mani
      { date: "2026-04-22", price: 600 },   // Corpus Christi Sign - Nitin
      { date: "2026-04-16", price: 400 },   // Laser Metal Fabrication - Arabind
      { date: "2026-04-20", price: 520 },   // Krupa Services - Abhinav
      { date: "2026-04-20", price: 800 },   // Lumi Star - Nitin
      { date: "2026-04-20", price: 800 },   // TQ Fab - Mani
      { date: "2026-04-20", price: 1200 },  // Continental Ind - Abhinav
    ];

    // Build closes + ARR per day
    const closesMap: Record<string, { count: number; arr: number }> = {};
    for (const r of allCloses) {
      const d = String(r.date);
      const price = Number(r.price) || 0;
      if (!closesMap[d]) closesMap[d] = { count: 0, arr: 0 };
      closesMap[d].count++;
      closesMap[d].arr += price * 12;
    }

    // Collect all working days (Mon-Fri only)
    const allDates = new Set<string>();
    for (const d of Object.keys(showupsMap)) allDates.add(d);
    for (const d of Object.keys(demosMap)) allDates.add(d);
    for (const d of Object.keys(closesMap)) allDates.add(d);

    const isWeekday = (d: string) => {
      const day = new Date(d + "T12:00:00").getDay();
      return day !== 0 && day !== 6;
    };

    const sortedDates = Array.from(allDates).filter(isWeekday).sort();

    const t = getTargets();
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

      const showupTargetTillDate = Math.round((t.showups / t.workingDays) * dayIndex);
      const demoTargetTillDate = Math.round((t.demos / t.workingDays) * dayIndex);
      const closesTargetTillDate = Math.round((t.closes / t.workingDays) * dayIndex);
      const arrTargetTillDate = Math.round((t.arr / t.workingDays) * dayIndex);

      return {
        date,
        showups: dayShowups,
        showups_mtd: showupsMtd,
        showup_target: t.showups,
        showup_attainment: t.showups > 0 ? Number(((showupsMtd / t.showups) * 100).toFixed(2)) : 0,
        demos: dayDemos,
        demos_mtd: demosMtd,
        demo_target: t.demos,
        demo_attainment: t.demos > 0 ? Number(((demosMtd / t.demos) * 100).toFixed(2)) : 0,
        closes: dayCloses,
        closes_mtd: closesMtd,
        closes_target_till_date: closesTargetTillDate,
        closes_target: t.closes,
        close_attainment: t.closes > 0 ? Number(((closesMtd / t.closes) * 100).toFixed(2)) : 0,
        arr: dayArr,
        arr_mtd: arrMtd,
        arr_target_till_date: arrTargetTillDate,
        arr_target: t.arr,
        arr_attainment: t.arr > 0 ? Number(((arrMtd / t.arr) * 100).toFixed(2)) : 0,
        working_days_gone: dayIndex,
        pct_working_days: Number(((dayIndex / t.workingDays) * 100).toFixed(1)),
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
