import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { createCache } from "@/lib/cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = createCache<any>(10 * 60 * 1000);

function defaultFrom() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function extractProspectDomains(participants: string | null): string[] {
  if (!participants) return [];
  const domains: string[] = [];
  const regex = /\(([a-z0-9.-]+\.[a-z]{2,})\)/gi;
  let match;
  while ((match = regex.exec(participants)) !== null) {
    const domain = match[1].toLowerCase();
    if (domain !== "gushwork.ai" && domain !== "gmail.com" && domain !== "yahoo.com" && domain !== "hotmail.com" && domain !== "outlook.com") {
      domains.push(domain);
    }
  }
  return domains;
}

function extractCompanyFromTitle(title: string | null): string | null {
  if (!title) return null;
  const m = title.match(/Digital Strategy Call\s*-\s*(.+?)(?:\s*<>\s*Gushwork.*)?$/i);
  return m ? m[1].trim() : null;
}

function extractDomain(account: string): string | null {
  let s = account.trim().toLowerCase();
  if (s.includes("@")) s = s.split("@")[1] || "";
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0].trim();
  if (!s.includes(".")) return null;
  return s;
}

// Outbound closes — hardcoded (same as ae-tracker, MRR in USD)
const allCloses = [
  { date: "2026-04-01", price: 800,  account: "M2 Antenna Systems",                 ae: "Arabind" },
  { date: "2026-04-01", price: 800,  account: "Engineered Roofing Systems",         ae: "Mani"    },
  { date: "2026-04-06", price: 800,  account: "CNC Programming Solutions",          ae: "Abhinav" },
  { date: "2026-04-08", price: 1540, account: "DEI Power",                          ae: "Abhinav" },
  { date: "2026-04-08", price: 600,  account: "MTS Forge",                          ae: "Mani"    },
  { date: "2026-04-09", price: 1500, account: "Specgas",                            ae: "Ajith"   },
  { date: "2026-04-13", price: 550,  account: "https://www.marseng.com/",           ae: "Abhinav" },
  { date: "2026-04-14", price: 800,  account: "https://www.thewindscreenfactory.net/", ae: "Abhinav" },
  { date: "2026-04-14", price: 800,  account: "https://mansfieldec.com/",           ae: "Abhinav" },
  { date: "2026-04-14", price: 800,  account: "https://www.esg-intl.com/",          ae: "Arabind" },
  { date: "2026-04-20", price: 500,  account: "https://www.artesian-systems.com/",  ae: "Abhinav" },
  { date: "2026-04-20", price: 1000, account: "https://nidrapack.com",              ae: "Mani"    },
  { date: "2026-04-21", price: 800,  account: "https://lumi-star.com/",             ae: "Nitin"   },
  { date: "2026-04-22", price: 520,  account: "https://www.krupa-services.com/",    ae: "Abhinav" },
  { date: "2026-04-22", price: 800,  account: "https://tqfab.com/",                 ae: "Mani"    },
  { date: "2026-04-23", price: 400,  account: "https://a-sparkvn.com/",             ae: "Nitin"   },
  { date: "2026-04-23", price: 400,  account: "www.marcusmanufacturing.com",        ae: "Nitin"   },
  { date: "2026-04-27", price: 1200, account: "mike@continental-ind.net",           ae: "Abhinav" },
  { date: "2026-04-27", price: 800,  account: "https://ipsinc.info/",               ae: "Ajith"   },
  { date: "2026-04-28", price: 1020, account: "https://hixson-inc.com/",            ae: "Mani"    },
  { date: "2026-04-30", price: 650,  account: "https://storageproductscompany.com/", ae: "Sukriti" },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || defaultFrom();
  const to = searchParams.get("to") || new Date().toISOString().split("T")[0];

  try {
    const cacheKey = `${from}|${to}`;
    const cached = cache.get(cacheKey);
    if (cached) return NextResponse.json(cached);

    // 1. Unique leads emailed per week
    const emailQuery = `
      SELECT
        DATE_TRUNC('week', (sent_time AT TIME ZONE 'America/Los_Angeles')::date)::date AS week_start,
        COUNT(DISTINCT LOWER(TRIM(lead_email))) AS unique_leads_emailed
      FROM gist.gtm_email_campaign_stats
      WHERE sent_time IS NOT NULL
        AND lead_email IS NOT NULL AND TRIM(lead_email) <> ''
        AND (sent_time AT TIME ZONE 'America/Los_Angeles')::date BETWEEN $1::date AND $2::date
      GROUP BY 1
      ORDER BY 1 DESC
    `;

    // 2. Calls per week with burner/non-burner split + demos
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
        SELECT jc.call_date, jc.disposition,
          REGEXP_REPLACE(jc.contact_number, '\\D', '', 'g') AS norm_phone
        FROM gist.justcall_burner_email_call_logs jc
        WHERE jc.contact_number IS NOT NULL
          AND COALESCE(jc.campaign_name, '') NOT ILIKE '%meta%'
          AND COALESCE(jc.agent_name, '') NOT ILIKE '%allaine%'
          AND jc.call_date BETWEEN $1::date AND $2::date
          AND EXTRACT(DOW FROM jc.call_date) NOT IN (0, 6)
      ),
      calls_labeled AS (
        SELECT cb.call_date, cb.norm_phone,
          CASE WHEN sl.lead_id IS NOT NULL THEN 'burner' ELSE 'non_burner' END AS burner_flag,
          CASE WHEN cb.disposition ILIKE '%DM : Meeting Booked%' THEN 1 ELSE 0 END AS is_demo
        FROM calls_base cb
        LEFT JOIN smartlead_dedup sl ON cb.norm_phone = sl.norm_phone
      )
      SELECT
        DATE_TRUNC('week', call_date)::date AS week_start,
        COUNT(DISTINCT CASE WHEN burner_flag = 'burner' THEN norm_phone END) AS unique_called_burner,
        COUNT(DISTINCT CASE WHEN burner_flag = 'non_burner' THEN norm_phone END) AS unique_called_nonburner,
        COALESCE(SUM(CASE WHEN burner_flag = 'burner' AND is_demo = 1 THEN 1 ELSE 0 END), 0) AS demos_burner,
        COALESCE(SUM(CASE WHEN burner_flag = 'non_burner' AND is_demo = 1 THEN 1 ELSE 0 END), 0) AS demos_nonburner
      FROM calls_labeled
      GROUP BY 1
      ORDER BY 1 DESC
    `;

    // 3. Showups per week — fetch individual rows for burner classification
    const showupsQuery = `
      SELECT
        meeting_id,
        DATE_TRUNC('week', DATE(to_timestamp(start_time / 1000)))::date AS week_start,
        title,
        participants_names
      FROM gist.sybill_meetings
      WHERE start_time IS NOT NULL
        AND LOWER(title) LIKE '%digital strategy%'
        AND DATE(to_timestamp(start_time / 1000)) BETWEEN $1::date AND $2::date
    `;

    // 4. Burner classification for closes — match domain against gtm_smartlead_leads.lead_website
    const closesInRange = allCloses.filter(c => c.date >= from && c.date <= to);
    const closeDomains = Array.from(
      new Set(closesInRange.map(c => extractDomain(c.account)).filter((d): d is string => !!d))
    );
    const burnerDomainsQuery = closeDomains.length === 0
      ? Promise.resolve({ rows: [] as { domain: string }[] })
      : pool.query<{ domain: string }>(
          `SELECT DISTINCT
             LOWER(SPLIT_PART(REGEXP_REPLACE(REGEXP_REPLACE(lead_website, '^https?://', '', 'i'), '^www\\.', '', 'i'), '/', 1)) AS domain
           FROM gist.gtm_smartlead_leads
           WHERE lead_website IS NOT NULL AND TRIM(lead_website) <> ''
             AND LOWER(SPLIT_PART(REGEXP_REPLACE(REGEXP_REPLACE(lead_website, '^https?://', '', 'i'), '^www\\.', '', 'i'), '/', 1)) = ANY($1::text[])`,
          [closeDomains]
        );

    const [emailRes, callsRes, showupsRes, burnerDomainsRes] = await Promise.all([
      pool.query(emailQuery, [from, to]),
      pool.query(callsQuery, [from, to]),
      pool.query(showupsQuery, [from, to]),
      burnerDomainsQuery,
    ]);
    const burnerDomainSet = new Set(burnerDomainsRes.rows.map(r => r.domain));

    // Build lookup maps
    const emailMap: Record<string, number> = {};
    for (const r of emailRes.rows) emailMap[String(r.week_start)] = Number(r.unique_leads_emailed);

    const callsMap: Record<string, {
      burner: number; nonburner: number; demos_burner: number; demos_nonburner: number;
    }> = {};
    for (const r of callsRes.rows) {
      callsMap[String(r.week_start)] = {
        burner: Number(r.unique_called_burner),
        nonburner: Number(r.unique_called_nonburner),
        demos_burner: Number(r.demos_burner),
        demos_nonburner: Number(r.demos_nonburner),
      };
    }

    // Classify showups as burner / non-burner
    // Step 1: extract prospect domains from participants_names
    const meetingParsed: { weekStart: string; domains: string[]; company: string | null }[] = [];
    const allShowupDomains = new Set<string>();
    for (const r of showupsRes.rows) {
      const domains = extractProspectDomains(r.participants_names);
      const company = extractCompanyFromTitle(r.title);
      meetingParsed.push({ weekStart: String(r.week_start), domains, company });
      for (const d of domains) allShowupDomains.add(d);
    }

    // Step 2: check which prospect domains exist in smartlead_leads (via lead_email domain)
    const showupDomainList = Array.from(allShowupDomains);
    const showupBurnerDomainsRes = showupDomainList.length === 0
      ? { rows: [] as { domain: string }[] }
      : await pool.query<{ domain: string }>(
          `SELECT DISTINCT LOWER(SPLIT_PART(lead_email, '@', 2)) AS domain
           FROM gist.gtm_smartlead_leads
           WHERE lead_email IS NOT NULL AND TRIM(lead_email) <> '' AND lead_email LIKE '%@%'
             AND LOWER(SPLIT_PART(lead_email, '@', 2)) = ANY($1::text[])`,
          [showupDomainList]
        );
    const showupBurnerDomainSet = new Set(showupBurnerDomainsRes.rows.map(r => r.domain));

    // Step 3: for meetings with no extractable domain, try company name match
    const noDomainCompanies = meetingParsed
      .filter(m => m.domains.length === 0 && m.company)
      .map(m => (m.company as string).toLowerCase());
    const uniqueCompanies = Array.from(new Set(noDomainCompanies));
    const showupBurnerCompaniesRes = uniqueCompanies.length === 0
      ? { rows: [] as { company: string }[] }
      : await pool.query<{ company: string }>(
          `SELECT DISTINCT LOWER(TRIM(lead_company_name)) AS company
           FROM gist.gtm_smartlead_leads
           WHERE lead_company_name IS NOT NULL AND TRIM(lead_company_name) <> ''
             AND LOWER(TRIM(lead_company_name)) = ANY($1::text[])`,
          [uniqueCompanies]
        );
    const showupBurnerCompanySet = new Set(showupBurnerCompaniesRes.rows.map(r => r.company));

    // Step 4: build showups maps split by burner/non-burner
    const showupsBurnerMap: Record<string, number> = {};
    const showupsNonburnerMap: Record<string, number> = {};
    for (const m of meetingParsed) {
      const isBurner = m.domains.some(d => showupBurnerDomainSet.has(d))
        || (m.domains.length === 0 && m.company && showupBurnerCompanySet.has(m.company.toLowerCase()));
      if (isBurner) {
        showupsBurnerMap[m.weekStart] = (showupsBurnerMap[m.weekStart] || 0) + 1;
      } else {
        showupsNonburnerMap[m.weekStart] = (showupsNonburnerMap[m.weekStart] || 0) + 1;
      }
    }

    // Closes grouped by week — split into burner / non-burner by smartlead website match
    type CloseBucket = { count: number; accounts: string[] };
    const closesBurnerMap: Record<string, CloseBucket> = {};
    const closesNonburnerMap: Record<string, CloseBucket> = {};
    for (const c of closesInRange) {
      const d = new Date(c.date + "T12:00:00");
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const wd = new Date(d.getFullYear(), d.getMonth(), diff);
      const weekStart = `${wd.getFullYear()}-${String(wd.getMonth() + 1).padStart(2, "0")}-${String(wd.getDate()).padStart(2, "0")}`;
      const dom = extractDomain(c.account);
      const isBurner = !!(dom && burnerDomainSet.has(dom));
      const target = isBurner ? closesBurnerMap : closesNonburnerMap;
      if (!target[weekStart]) target[weekStart] = { count: 0, accounts: [] };
      target[weekStart].count += 1;
      target[weekStart].accounts.push(c.account);
    }

    // Union all week_starts
    const allWeeks = new Set<string>();
    for (const k of Object.keys(emailMap)) allWeeks.add(k);
    for (const k of Object.keys(callsMap)) allWeeks.add(k);
    for (const k of Object.keys(showupsBurnerMap)) allWeeks.add(k);
    for (const k of Object.keys(showupsNonburnerMap)) allWeeks.add(k);
    for (const k of Object.keys(closesBurnerMap)) allWeeks.add(k);
    for (const k of Object.keys(closesNonburnerMap)) allWeeks.add(k);

    const rows = Array.from(allWeeks)
      .sort((a, b) => b.localeCompare(a))
      .map((week) => {
        const emailed = emailMap[week] || 0;
        const calls = callsMap[week] || { burner: 0, nonburner: 0, demos_burner: 0, demos_nonburner: 0 };
        const cb = closesBurnerMap[week] || { count: 0, accounts: [] };
        const cn = closesNonburnerMap[week] || { count: 0, accounts: [] };
        return {
          week_start: week,
          unique_leads_emailed: emailed,
          unique_called_burner: calls.burner,
          unique_called_nonburner: calls.nonburner,
          demos_burner: calls.demos_burner,
          demos_nonburner: calls.demos_nonburner,
          showups_burner: showupsBurnerMap[week] || 0,
          showups_nonburner: showupsNonburnerMap[week] || 0,
          closes_burner: cb.count,
          closes_nonburner: cn.count,
          closes_burner_accounts: cb.accounts,
          closes_nonburner_accounts: cn.accounts,
        };
      });

    const result = { rows };
    cache.set(cacheKey, result);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
