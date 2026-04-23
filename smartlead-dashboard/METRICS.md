# SmartLead Dashboard — Metrics Logic

This document describes the exact SQL and Postgres logic used to compute **Total Calls**, **Demo (Call Date)**, **Demos Scheduled**, and **Showups** in the dashboard, along with the monthly targets that feed every attainment number.

> All queries are parameterized with `$1 = from` and `$2 = to` (inclusive `YYYY-MM-DD`), and `$3 = monthly call target`.
> Every query excludes weekends, the `meta` campaign, and the `allaine` agent unless noted.

---

## 1. Total Calls (and Calls MTD / Attainment)

**Source table:** `gist.justcall_burner_email_call_logs`
**Defined in:** `app/api/calls/route.ts`

The same query also produces the per-day breakdown by source (SalesDialer vs JustCall), unique dials, and the per-day **Demo (Call Date)** count — they all derive from the same call log.

```sql
WITH daily_logs AS (
  SELECT
    ((call_date::text || ' ' || call_time::text)::timestamp
       - interval '4 hours')::date                                       AS date,
    COUNT(*)                                                             AS total_calls,
    SUM(CASE WHEN campaign_id IS NOT NULL THEN 1 ELSE 0 END)             AS sales_dialer_calls,
    SUM(CASE WHEN campaign_id IS NULL     THEN 1 ELSE 0 END)             AS justcall_calls,
    COUNT(DISTINCT contact_number)                                       AS unique_dials,
    SUM(CASE WHEN disposition ILIKE '%DM : Meeting Booked%' THEN 1 ELSE 0 END) AS demos
  FROM gist.justcall_burner_email_call_logs
  WHERE COALESCE(campaign_name, '') NOT ILIKE '%meta%'
    AND COALESCE(agent_name, '')    NOT ILIKE '%allaine%'
    AND ((call_date::text || ' ' || call_time::text)::timestamp
           - interval '4 hours')::date BETWEEN $1::date AND $2::date
  GROUP BY 1
)
SELECT
  date,
  total_calls,
  SUM(total_calls) OVER (
    PARTITION BY DATE_TRUNC('month', date)
    ORDER BY date
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )                                                                       AS calls_mtd,
  $3::int                                                                 AS target,
  ROUND(
    SUM(total_calls) OVER (
      PARTITION BY DATE_TRUNC('month', date)
      ORDER BY date
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::numeric / $3::int * 100, 2
  )                                                                       AS attainment,
  sales_dialer_calls,
  justcall_calls,
  unique_dials,
  demos
FROM daily_logs
WHERE EXTRACT(DOW FROM date) NOT IN (0, 6)   -- weekdays only
ORDER BY date DESC;
```

**Notes**
- The `(call_date || ' ' || call_time)::timestamp - interval '4 hours'` expression converts the stored UTC timestamp to US Eastern Time, so the day boundary matches the SDR work-day.
- `calls_mtd` is a Postgres window function — every visible row carries the running monthly total for *that* row's month. Within the displayed range it acts as MTD; if a row is the first row of a month, `calls_mtd = total_calls`.
- `attainment = calls_mtd / monthly_target * 100`.

---

## 2. Demo (Call Date)

This is the per-day count of dispositions marked `DM : Meeting Booked`, attributed to the **call date** (not the demo date). It is the `demos` column produced by the query in §1 above:

```sql
SUM(CASE WHEN disposition ILIKE '%DM : Meeting Booked%' THEN 1 ELSE 0 END) AS demos
```

> This is **different** from **Demos Scheduled** (§3). "Demo (Call Date)" answers "how many demos were booked off calls placed today?" — it is pure dialer attribution and uses the call log only. "Demos Scheduled" answers "how many demos are on the calendar for today?" and uses a separate booking table.

---

## 3. Demos Scheduled (and Demo Attainment)

**Sources:**
- Hardcoded values in code for **2026-04-01 through 2026-04-13** (booking table didn't have clean data for those dates)
- DB query against `gist.gtm_demo_bookings` for **2026-04-14 onward**

**Defined in:** `app/api/calls/route.ts` and `app/api/ae-tracker/route.ts`

### Hardcoded values (Apr 1 – Apr 13)

| Date | Demos Scheduled |
|---|---|
| 2026-04-01 | 28 |
| 2026-04-02 | 19 |
| 2026-04-03 | 13 |
| 2026-04-06 | 24 |
| 2026-04-07 | 27 |
| 2026-04-08 | 25 |
| 2026-04-09 | 21 |
| 2026-04-10 | 28 |
| 2026-04-13 | 21 |

### Query (Apr 14+)

```sql
SELECT
  demo_scheduled_date::date                          AS date,
  COUNT(DISTINCT LOWER(TRIM(account_name)))          AS demos_scheduled
FROM (
  SELECT
    account_name,
    demo_scheduled_date,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM(account_name))
      ORDER BY demo_scheduled_date DESC
    ) AS rn
  FROM gist.gtm_demo_bookings
  WHERE demo_scheduled_date IS NOT NULL
    AND demo_scheduled_date::date >= GREATEST($1::date, '2026-04-14'::date)
    AND demo_scheduled_date::date <= $2::date
) t
WHERE rn = 1
GROUP BY 1
ORDER BY 1;
```

**Notes**
- `ROW_NUMBER()` keeps **only the latest** scheduled date per account — so if the same account was rescheduled multiple times, we count only the most recent demo.
- `COUNT(DISTINCT account_name)` deduplicates by company (case- and whitespace-insensitive).
- `GREATEST($1, '2026-04-14')` is the cutover guard: even if the user picks a `from` date earlier than April 14, the DB query starts at April 14 (the hardcoded map fills the earlier days).

**Attainment** = `demos_scheduled_mtd / monthly_demo_plan * 100`, computed in JS after summing daily values.

---

## 4. Showups

**Source table:** `gist.sybill_meetings`
**Defined in:** `app/api/calls/route.ts` and `app/api/ae-tracker/route.ts`

```sql
WITH meetings_clean AS (
  SELECT to_timestamp(start_time / 1000) AS meeting_ts
  FROM gist.sybill_meetings
  WHERE start_time IS NOT NULL
    AND LOWER(title) LIKE '%digital strategy%'
)
SELECT
  DATE(meeting_ts) AS date,
  COUNT(*)         AS showups
FROM meetings_clean
WHERE DATE(meeting_ts) BETWEEN $1::date AND $2::date
GROUP BY 1
ORDER BY 1;
```

**Notes**
- `start_time` is a Unix epoch in **milliseconds**; `to_timestamp(start_time / 1000)` converts it.
- The `title LIKE '%digital strategy%'` filter restricts to the AE Digital Strategy meeting type — anything else (internal syncs, training calls, etc.) is excluded.
- `Showups MTD` is computed in the JS layer: rows are sorted ascending and a running sum is accumulated per day.
- `Daily Showup Target` is a proportional pace target: `round(monthly_plan / 22 * day_index_in_month)`.
- `Showup Attainment` = `showups_mtd / monthly_plan * 100`.

---

## 5. Targets — side-by-side

The two dashboard folders share identical SQL but ship with different monthly target constants. All targets below are for **April 2026**.

### Cold Calling tab (per-day MTD attainment)

| Constant | Deployed | Conservative | Code location |
|---|---|---|---|
| `MONTH_CALL_TARGET` (calls / month) | **100,000** | **92,400** | `app/api/calls/route.ts` |
| `MONTH_DEMO_PLAN` (demos / month) | **550** | **463** | `app/api/calls/route.ts` |
| `SHOWUP_PLAN` (showups / month) | **250** | **185** | `app/api/calls/route.ts` |
| Working days (denominator) | 22 | 22 | `TOTAL_WORKING_DAYS` |
| Monthly max unique contacts | 79,000 | 79,000 | `MONTHLY_MAX_CONTACTS` |

### Daily AE Tracker tab

| Field (April 2026) | Deployed | Conservative | Code location |
|---|---|---|---|
| `showups` | **250** | **185** | `MONTHLY_TARGETS["2026-04"]` in `app/api/ae-tracker/route.ts` |
| `demos`   | **550** | **463** | same |
| `closes`  | **40**  | **19**  | same |
| `arr`     | **$384,000** | **$155,952** | same |
| `workingDays` | 22 | 22 | same |

### Daily AE Tracker tab (May 2026, conservative only diverges)

| Field (May 2026) | Deployed | Conservative |
|---|---|---|
| `showups` | 250 | **148** |
| `demos`   | 550 | **370** |
| `closes`  | 40  | **17** |
| `arr`     | $384,000 | **$141,038** |
| `workingDays` | 21 | 21 |

### Stat-card subtitles (page.tsx, cosmetic only)

The Cold Calling stat-cards on the dashboard show four hardcoded subtitle strings that mirror the targets above — change them whenever the constants above change:

| Card | Deployed | Conservative |
|---|---|---|
| Calls MTD       | `% of 100K target` | `% of 92.4K target` |
| Demos Scheduled | `% of 550 target`  | `% of 463 target` |
| Showups MTD     | `% of 250 target`  | `% of 185 target` |
| Showup Attainment | `vs 250 plan`    | `vs 185 plan` |

---

## 6. Universal filter rules (apply to *every* call-log query)

```sql
COALESCE(campaign_name, '') NOT ILIKE '%meta%'
COALESCE(agent_name, '')    NOT ILIKE '%allaine%'
EXTRACT(DOW FROM date) NOT IN (0, 6)   -- weekdays only
```

These three filters are applied in every query that touches `justcall_burner_email_call_logs` so that Meta-campaign calls and Allaine's calls are excluded across the board, and weekends never appear as zero-data rows.

---

## 7. Date semantics

- All dates passed to the API (`from`, `to`) are inclusive `YYYY-MM-DD` strings.
- Call-log dates are converted from UTC to US Eastern (`-4 hours`) before bucketing.
- Email-stats dates use `AT TIME ZONE 'America/Los_Angeles'` (used by the Burner Email tab; included here for completeness).
- Showup dates use Postgres' default timezone for `to_timestamp()` (UTC) — Sybill stores meetings in epoch ms and they're bucketed by UTC date.
