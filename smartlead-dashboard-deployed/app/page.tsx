"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import DateRangePicker from "./components/DateRangePicker";

/* ─── Types ─── */

type EmailRow = {
  date: string;
  emails_sent: number;
  target_emails_sent: number | null;
  attainment: number | null;
  bounce_rate: number;
  emails_2plus_opens: number;
  open_2plus_rate: number;
  unique_2plus_no_call: number;
  calls_burner: number | null;
  demos_burner: number | null;
  demo_call_rate_burner: number | null;
  calls_non_burner: number | null;
  demos_non_burner: number | null;
  demo_call_rate_non_burner: number | null;
  lift_from_burner: number | null;
  if_no_burner: number | null;
  difference: number | null;
};

type CallRow = {
  date: string;
  total_calls: number;
  calls_mtd: number;
  target: number;
  attainment: number;
  sales_dialer_calls: number;
  justcall_calls: number;
  unique_dials: number;
  new_contacts: number;
  unique_contacts_mtd: number;
  monthly_max_contacts: number;
  pct_contacts_used: number;
  demos: number;
  demos_scheduled: number;
  demos_scheduled_mtd: number;
  demo_plan: number;
  demo_attainment: number;
  demo_to_call_rate: number;
  showup_rate: number;
  showups: number;
  showups_mtd: number;
  showup_target: number;
  showup_plan: number;
  showup_attainment: number;
  working_days_gone: number;
  pct_working_days: number;
};

type OutboundCostRow = {
  user_email: string;
  name: string;
  week_start: string;
  hours_logged: number;
  capped_hours: number;
  hourly_rate: number;
  weekly_payout: number;
};

type MasterDBRow = {
  week_start: string;
  unique_leads_emailed: number;
  unique_called_burner: number;
  unique_called_nonburner: number;
  demos_burner: number;
  demos_nonburner: number;
  showups_burner: number;
  showups_nonburner: number;
  closes_burner: number;
  closes_nonburner: number;
  closes_burner_accounts: string[];
  closes_nonburner_accounts: string[];
};

/* ─── Helpers ─── */

function fmt(val: number | null | undefined, suffix = ""): string {
  if (val === null || val === undefined) return "—";
  return val.toLocaleString() + suffix;
}

function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

type ColDef<T> = { key: keyof T; short: string; full: string; suffix?: string };

/* ─── Column definitions ─── */

const EMAIL_COLS: ColDef<EmailRow>[] = [
  { key: "date",                     short: "Date",                full: "Date" },
  { key: "emails_sent",              short: "Emails Sent",         full: "# of Emails Sent" },
  { key: "target_emails_sent",       short: "Target Sent",         full: "Target Emails Sent" },
  { key: "attainment",               short: "Attainment",          full: "Attainment", suffix: "%" },
  { key: "bounce_rate",              short: "Bounce %",            full: "Bounce Rate", suffix: "%" },
  { key: "emails_2plus_opens",       short: "Unique ≥2 Opens",full: "# of Unique Leads with ≥2 Opens (daily)" },
  { key: "open_2plus_rate",          short: "≥2 Open Rate",   full: "≥2 Open to Email Sent Rate", suffix: "%" },
  { key: "unique_2plus_no_call",     short: "≥2 Opens No Call", full: "# First-time ≥2 Opens with Phone Number" },
  { key: "calls_burner",             short: "Calls (Burner)",      full: "# of Calls to Burner Email Opens [Incl. Manual Dials]" },
  { key: "demos_burner",             short: "Demos (Burner)",      full: "# of Demos Booked from Burner Emails" },
  { key: "demo_call_rate_burner",    short: "Demo:Call Burner",    full: "Demo to Call Rate — Burner Email", suffix: "%" },
  { key: "calls_non_burner",         short: "Calls (Non-Burner)",  full: "# of Calls Made to Non-Burner Email Opens" },
  { key: "demos_non_burner",         short: "Demos (Non-Burner)",  full: "# of Demos Booked from Non-Burner Email Opens" },
  { key: "demo_call_rate_non_burner",short: "Demo:Call Non-Burner",full: "Demo to Call Rate — Non Burner Email", suffix: "%" },
  { key: "lift_from_burner",         short: "Burner Lift",         full: "Lift from Burner Email (Rate Difference)", suffix: "%" },
  { key: "if_no_burner",             short: "If No Burner",        full: "If Burner Email Was Not There (Hypothetical Demos)" },
  { key: "difference",               short: "Difference",          full: "Difference (Actual Burner Demos − Hypothetical)" },
];

const CALL_COLS: ColDef<CallRow>[] = [
  { key: "date",                short: "Date",                full: "Date" },
  { key: "total_calls",         short: "# of Calls",          full: "# of Calls" },
  { key: "calls_mtd",           short: "# Calls MTD",         full: "# of Calls MTD" },
  { key: "target",              short: "Month Target",        full: "# of Calls Month — Target" },
  { key: "attainment",          short: "Calls Attainment",    full: "# of Calls Attainment", suffix: "%" },
  { key: "sales_dialer_calls",  short: "SalesDialer",         full: "# SalesDialer Calls" },
  { key: "justcall_calls",      short: "JustCall",            full: "# JustCall Calls" },
  { key: "unique_dials",        short: "Unique Dials",        full: "# of Unique Dials per Day" },
  { key: "new_contacts",        short: "New Contacts",        full: "# Total New Contacts Loaded" },
  { key: "unique_contacts_mtd", short: "Unique MTD",          full: "# of Unique Contacts MTD" },
  { key: "monthly_max_contacts",short: "Max Contacts",        full: "Monthly Maximum Unique Contacts (79,000)" },
  { key: "pct_contacts_used",   short: "% Contacts Used",     full: "Percentage of Monthly Contacts Used", suffix: "%" },
  { key: "demos",               short: "Demos (Call)",        full: "# of Demos (Call Date)" },
  { key: "demos_scheduled",     short: "Demos Scheduled",     full: "# of Demos Scheduled for That Day" },
  { key: "demos_scheduled_mtd", short: "Demos Sched MTD",     full: "# of Demos Scheduled MTD" },
  { key: "demo_plan",           short: "Demo Plan",           full: "# of Demos Plan for Month" },
  { key: "demo_attainment",     short: "Demo Attainment",     full: "Attainment — Demos", suffix: "%" },
  { key: "demo_to_call_rate",   short: "Demo:Call Rate",      full: "Demo to Call Rate (Call Date)", suffix: "%" },
  { key: "showup_rate",         short: "Showup Rate",         full: "Show-up to Demo Rate (Demo Date)", suffix: "%" },
  { key: "showups",             short: "# Showups",           full: "# of Show-ups" },
  { key: "showups_mtd",         short: "Showups MTD",         full: "# of Show-ups MTD" },
  { key: "showup_target",       short: "Target MTD",          full: "# Target MTD" },
  { key: "showup_plan",         short: "Showup Plan",         full: "# of Show-ups Plan" },
  { key: "showup_attainment",   short: "Showup Attainment",   full: "Attainment — Show-ups", suffix: "%" },
  { key: "working_days_gone",   short: "Days Gone",           full: "Working Days Gone" },
  { key: "pct_working_days",    short: "% Days Gone",         full: "Percentage of Working Days Gone", suffix: "%" },
];

const AE_COLS: { key: string; short: string; full: string; isCurrency?: boolean; isPct?: boolean; suffix?: string }[] = [
  { key: "date",                    short: "Date",              full: "Date" },
  { key: "showups",                 short: "# Showups",         full: "# of Show-ups" },
  { key: "showups_mtd",             short: "Showups MTD",       full: "# of Show-ups MTD" },
  { key: "showup_target",           short: "Showup Target",     full: "Show-up Target" },
  { key: "showup_attainment",       short: "Showup Attainment", full: "Attainment — Show-ups", isPct: true },
  { key: "demos",                   short: "# Demos",           full: "# of Demos" },
  { key: "demos_mtd",               short: "Demos MTD",         full: "# of Demos MTD" },
  { key: "demo_target",             short: "Demo Target",       full: "Demo Target" },
  { key: "demo_attainment",         short: "Demo Attainment",   full: "Attainment — Demos", isPct: true },
  { key: "closes",                  short: "# Closes",          full: "# of Closes" },
  { key: "closes_mtd",              short: "Closes MTD",        full: "# of Closes MTD" },
  { key: "closes_target_till_date", short: "Close Target TD",   full: "Close Target Till Date" },
  { key: "closes_target",           short: "Close Target",      full: "Close Target" },
  { key: "close_attainment",        short: "Close Attainment",  full: "Attainment — Closes", isPct: true },
  { key: "arr",                     short: "ARR Closed",        full: "ARR Closed", isCurrency: true },
  { key: "arr_mtd",                 short: "ARR MTD",           full: "ARR Closed MTD", isCurrency: true },
  { key: "arr_target_till_date",    short: "ARR Target TD",     full: "ARR Target Till Date", isCurrency: true },
  { key: "arr_target",              short: "ARR Target",        full: "ARR Target", isCurrency: true },
  { key: "arr_attainment",          short: "ARR Attainment",    full: "Attainment — ARR", isPct: true },
  { key: "working_days_gone",       short: "Days Gone",         full: "Working Days Gone" },
];

/* ─── Aggregate helpers ─── */

function latestRow<T extends { date: string }>(rows: T[]): T {
  return [...rows].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
}

function computeEmailTotals(rows: EmailRow[]): EmailRow {
  const sum = (k: keyof EmailRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const es = sum("emails_sent");
  const ts = sum("target_emails_sent");
  const cb = sum("calls_burner");
  const db = sum("demos_burner");
  const cnb = sum("calls_non_burner");
  const dnb = sum("demos_non_burner");
  const e2 = sum("emails_2plus_opens");
  const dcrB = cb > 0 ? (db / cb) * 100 : 0;
  const dcrNB = cnb > 0 ? (dnb / cnb) * 100 : 0;
  const bounceWeighted = es > 0 ? rows.reduce((s, r) => s + (Number(r.bounce_rate) || 0) * (Number(r.emails_sent) || 0), 0) / es : 0;
  return {
    date: "Total",
    emails_sent: es,
    target_emails_sent: ts,
    attainment: ts > 0 ? Number(((es / ts) * 100).toFixed(2)) : null,
    bounce_rate: Number(bounceWeighted.toFixed(2)),
    emails_2plus_opens: e2,
    open_2plus_rate: es > 0 ? Number(((e2 / es) * 100).toFixed(2)) : 0,
    unique_2plus_no_call: sum("unique_2plus_no_call"),
    calls_burner: cb,
    demos_burner: db,
    demo_call_rate_burner: Number(dcrB.toFixed(2)),
    calls_non_burner: cnb,
    demos_non_burner: dnb,
    demo_call_rate_non_burner: Number(dcrNB.toFixed(2)),
    lift_from_burner: Number((dcrB - dcrNB).toFixed(2)),
    if_no_burner: sum("if_no_burner"),
    difference: sum("difference"),
  };
}

function computeCallTotals(rows: CallRow[]): CallRow {
  const sum = (k: keyof CallRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const last = latestRow(rows);
  const tc = sum("total_calls");
  const d = sum("demos");
  const sh = sum("showups");
  return {
    ...last,
    date: "Total",
    total_calls: tc,
    sales_dialer_calls: sum("sales_dialer_calls"),
    justcall_calls: sum("justcall_calls"),
    unique_dials: sum("unique_dials"),
    new_contacts: sum("new_contacts"),
    demos: d,
    demos_scheduled: sum("demos_scheduled"),
    demo_to_call_rate: tc > 0 ? Number(((d / tc) * 100).toFixed(2)) : 0,
    showup_rate: d > 0 ? Number(((sh / d) * 100).toFixed(2)) : 0,
    showups: sh,
  };
}

function computeAeTotals(rows: Record<string, unknown>[]): Record<string, unknown> {
  const sum = (k: string) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const last = [...rows].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  return {
    ...last,
    date: "Total",
    showups: sum("showups"),
    demos: sum("demos"),
    closes: sum("closes"),
    arr: sum("arr"),
  };
}

/* ─── Component ─── */

export default function Dashboard() {
  const today = new Date().toISOString().split("T")[0];
  const monthStart = currentMonthStart();

  const [tab, setTab] = useState<"email" | "calls" | "ae" | "cost" | "touchpoint" | "masterdb">("email");

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const [emailRows, setEmailRows] = useState<EmailRow[]>([]);
  const [totalUnique2Plus, setTotalUnique2Plus] = useState(0);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [callRows, setCallRows] = useState<CallRow[]>([]);
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [aeRows, setAeRows] = useState<any[]>([]);
  const [aeLoading, setAeLoading] = useState(false);
  const [aeError, setAeError] = useState<string | null>(null);

  const [costRows, setCostRows] = useState<OutboundCostRow[]>([]);
  const [costLoading, setCostLoading] = useState(false);
  const [costError, setCostError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [touchpointData, setTouchpointData] = useState<any | null>(null);
  const [touchpointLoading, setTouchpointLoading] = useState(false);
  const [touchpointError, setTouchpointError] = useState<string | null>(null);
  const [touchpointFetched, setTouchpointFetched] = useState(false);

  const [masterdbRows, setMasterdbRows] = useState<MasterDBRow[]>([]);
  const [masterdbLoading, setMasterdbLoading] = useState(false);
  const [masterdbError, setMasterdbError] = useState<string | null>(null);

  // Bumping this re-runs every fetcher's effect, which aborts any in-flight request.
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchEmail = useCallback(async (signal: AbortSignal) => {
    setEmailLoading(true);
    setEmailError(null);
    try {
      const res = await fetch(`/api/metrics?from=${from}&to=${to}`, { signal });
      const json = await res.json();
      if (signal.aborted) return;
      if (json.error) throw new Error(json.error);
      setEmailRows(json.rows);
      setTotalUnique2Plus(json.totalUnique2Plus ?? 0);
    } catch (e: unknown) {
      if ((e instanceof Error && e.name === "AbortError") || signal.aborted) return;
      setEmailError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (!signal.aborted) setEmailLoading(false);
    }
  }, [from, to, refreshKey]);

  const fetchCalls = useCallback(async (signal: AbortSignal) => {
    setCallLoading(true);
    setCallError(null);
    try {
      const res = await fetch(`/api/calls?from=${from}&to=${to}`, { signal });
      const json = await res.json();
      if (signal.aborted) return;
      if (json.error) throw new Error(json.error);
      setCallRows(json.rows.map((r: Record<string, unknown>) => ({
        ...r,
        unique_dials: Number(r.unique_dials ?? 0),
        new_contacts: Number(r.new_contacts ?? 0),
        unique_contacts_mtd: Number(r.unique_contacts_mtd ?? 0),
        monthly_max_contacts: Number(r.monthly_max_contacts ?? 79000),
        pct_contacts_used: Number(r.pct_contacts_used ?? 0),
        demos: Number(r.demos ?? 0),
        demos_scheduled: Number(r.demos_scheduled ?? 0),
        demos_scheduled_mtd: Number(r.demos_scheduled_mtd ?? 0),
        demo_plan: Number(r.demo_plan ?? 0),
        demo_attainment: Number(r.demo_attainment ?? 0),
        demo_to_call_rate: Number(r.demo_to_call_rate ?? 0),
        showup_rate: Number(r.showup_rate ?? 0),
        showups: Number(r.showups ?? 0),
        showups_mtd: Number(r.showups_mtd ?? 0),
        showup_target: Number(r.showup_target ?? 0),
        showup_plan: Number(r.showup_plan ?? 250),
        showup_attainment: Number(r.showup_attainment ?? 0),
        working_days_gone: Number(r.working_days_gone ?? 0),
        pct_working_days: Number(r.pct_working_days ?? 0),
      })));
    } catch (e: unknown) {
      if ((e instanceof Error && e.name === "AbortError") || signal.aborted) return;
      setCallError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (!signal.aborted) setCallLoading(false);
    }
  }, [from, to, refreshKey]);

  const fetchAe = useCallback(async (signal: AbortSignal) => {
    setAeLoading(true);
    setAeError(null);
    try {
      const res = await fetch(`/api/ae-tracker?from=${from}&to=${to}`, { signal });
      const json = await res.json();
      if (signal.aborted) return;
      if (json.error) throw new Error(json.error);
      setAeRows(json.rows);
    } catch (e: unknown) {
      if ((e instanceof Error && e.name === "AbortError") || signal.aborted) return;
      setAeError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (!signal.aborted) setAeLoading(false);
    }
  }, [from, to, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    fetchEmail(controller.signal);
    return () => controller.abort();
  }, [fetchEmail]);
  useEffect(() => {
    const controller = new AbortController();
    fetchCalls(controller.signal);
    return () => controller.abort();
  }, [fetchCalls]);
  useEffect(() => {
    const controller = new AbortController();
    fetchAe(controller.signal);
    return () => controller.abort();
  }, [fetchAe]);

  const fetchCost = useCallback(async (signal: AbortSignal) => {
    setCostLoading(true);
    setCostError(null);
    try {
      const res = await fetch(`/api/outbound-cost?from=${from}&to=${to}`, { signal });
      const json = await res.json();
      if (signal.aborted) return;
      if (json.error) throw new Error(json.error);
      setCostRows((json.rows as Record<string, unknown>[]).map(r => ({
        user_email: String(r.user_email ?? ""),
        name: String(r.name ?? ""),
        week_start: String(r.week_start ?? ""),
        hours_logged: Number(r.hours_logged ?? 0),
        capped_hours: Number(r.capped_hours ?? 0),
        hourly_rate: Number(r.hourly_rate ?? 0),
        weekly_payout: Number(r.weekly_payout ?? 0),
      })));
    } catch (e: unknown) {
      if ((e instanceof Error && e.name === "AbortError") || signal.aborted) return;
      setCostError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (!signal.aborted) setCostLoading(false);
    }
  }, [from, to, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCost(controller.signal);
    return () => controller.abort();
  }, [fetchCost]);

  const fetchMasterDB = useCallback(async (signal: AbortSignal) => {
    setMasterdbLoading(true);
    setMasterdbError(null);
    try {
      const res = await fetch(`/api/master-db?from=${from}&to=${to}`, { signal });
      const json = await res.json();
      if (signal.aborted) return;
      if (json.error) throw new Error(json.error);
      setMasterdbRows(json.rows);
    } catch (e: unknown) {
      if ((e instanceof Error && e.name === "AbortError") || signal.aborted) return;
      setMasterdbError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (!signal.aborted) setMasterdbLoading(false);
    }
  }, [from, to, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    fetchMasterDB(controller.signal);
    return () => controller.abort();
  }, [fetchMasterDB]);

  // Eager-load touchpoint data on mount (API is sub-second since data is hardcoded)
  useEffect(() => {
    const controller = new AbortController();
    setTouchpointLoading(true);
    setTouchpointError(null);
    fetch("/api/sequence-funnel", { signal: controller.signal })
      .then(res => res.json())
      .then(json => {
        if (controller.signal.aborted) return;
        if (json.error) throw new Error(json.error);
        setTouchpointData(json);
        setTouchpointFetched(true);
      })
      .catch(e => {
        if ((e instanceof Error && e.name === "AbortError") || controller.signal.aborted) return;
        setTouchpointError(e instanceof Error ? e.message : "Unknown error");
      })
      .finally(() => { if (!controller.signal.aborted) setTouchpointLoading(false); });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  /* ─── Summary stats ─── */
  const emailSummary = emailRows.length > 0 ? {
    totalSent: emailRows.reduce((s, r) => s + r.emails_sent, 0),
    avgBounce: (emailRows.reduce((s, r) => s + r.bounce_rate, 0) / emailRows.length).toFixed(2),
    totalUnique2Plus,
    totalBurnerDemos: emailRows.reduce((s, r) => s + (r.demos_burner ?? 0), 0),
  } : null;

  const callSummary = callRows.length > 0 ? {
    callsMtd: callRows[0]?.calls_mtd ?? 0,
    callsAttainment: callRows[0]?.attainment ?? 0,
    callTarget: callRows[0]?.target ?? 0,
    showupsMtd: callRows[0]?.showups_mtd ?? 0,
    showupAttainment: callRows[0]?.showup_attainment ?? 0,
    showupPlan: callRows[0]?.showup_plan ?? 0,
    demoScheduledMtd: callRows[0]?.demos_scheduled_mtd ?? 0,
    demoAttainment: callRows[0]?.demo_attainment ?? 0,
    demoPlan: callRows[0]?.demo_plan ?? 0,
  } : null;

  function renderAttainment(val: number | null) {
    if (val === null) return <span className="text-gray-300">{"—"}</span>;
    const color = val >= 100 ? "text-emerald-600" : val >= 80 ? "text-amber-600" : "text-rose-600";
    return <span className={`font-semibold ${color}`}>{val.toFixed(1)}%</span>;
  }

  function renderEmailCell(row: EmailRow, col: ColDef<EmailRow>) {
    const val = row[col.key];
    if (col.key === "date") return <span className="text-[12px] text-gray-700">{String(val)}</span>;
    if (col.key === "attainment") return renderAttainment(val as number | null);
    if (val === null || val === undefined) return <span className="text-gray-300">{"—"}</span>;
    return <span className="text-gray-800">{fmt(val as number, col.suffix || "")}</span>;
  }

  function renderCallCell(row: CallRow, col: ColDef<CallRow>) {
    const val = row[col.key];
    if (col.key === "date") return <span className="text-[12px] text-gray-700">{String(val)}</span>;
    if (col.key === "attainment" || col.key === "showup_attainment" || col.key === "demo_attainment") return renderAttainment(val as number);
    return <span className="text-gray-800">{fmt(val as number, col.suffix || "")}</span>;
  }

  function StatCard({ label, value, sub, pct }: { label: string; value: string; sub?: string; pct?: number }) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold mb-2 text-gushwork-600">{label}</div>
        <div className="flex items-center gap-3">
          <div className="text-[22px] font-bold text-gray-900 tracking-tight leading-none">{value}</div>
          {pct !== undefined && <Donut pct={pct} />}
        </div>
        {sub && <div className="text-[11px] text-gray-500 mt-1.5">{sub}</div>}
      </div>
    );
  }

  /* ─── Reusable table classes ─── */
  const thCls = "px-4 py-3 text-left font-semibold whitespace-nowrap text-white text-[11px] bg-gushwork-500 border-b border-gushwork-600 first:pl-6";
  const tdCls = "px-4 py-3 whitespace-nowrap text-[12px] tabular-nums border-b border-gray-100 first:pl-6";
  const trCls = "hover:bg-gray-50 transition-colors";
  const tdTotalCls = "px-4 py-3 whitespace-nowrap text-[12px] tabular-nums font-semibold bg-gushwork-50 border-b-2 border-gushwork-200 first:pl-6";

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <div className="border-b border-gray-200 sticky top-0 z-10 bg-white">
        <div className="max-w-[1400px] mx-auto px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/gushwork-logo.png" alt="Gushwork" className="h-5 w-auto" />
            <span className="h-5 w-px bg-gray-200" aria-hidden />
            <span className="text-lg text-gushwork-600 font-semibold tracking-tight">GTM Dashboard</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[9px] text-gray-500 uppercase tracking-[0.2em]">Live</span>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 py-8">
        {/* Date Range + Tabs */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center bg-gray-100 rounded-lg p-1 w-fit">
            <button onClick={() => setTab("email")}
              className={`px-5 py-2 rounded-md text-[12px] font-medium transition-all duration-200 ${
                tab === "email" ? "bg-gushwork-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              Burner Email
            </button>
            <button onClick={() => setTab("calls")}
              className={`px-5 py-2 rounded-md text-[12px] font-medium transition-all duration-200 ${
                tab === "calls" ? "bg-gushwork-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              Cold Calling
            </button>
            <button onClick={() => setTab("ae")}
              className={`px-5 py-2 rounded-md text-[12px] font-medium transition-all duration-200 ${
                tab === "ae" ? "bg-gushwork-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              Daily AE Tracker
            </button>
            <button onClick={() => setTab("cost")}
              className={`px-5 py-2 rounded-md text-[12px] font-medium transition-all duration-200 ${
                tab === "cost" ? "bg-gushwork-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              CAC Tracker
            </button>
            <button onClick={() => setTab("touchpoint")}
              className={`px-5 py-2 rounded-md text-[12px] font-medium transition-all duration-200 ${
                tab === "touchpoint" ? "bg-gushwork-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              Burner Contacts Touchpoint DB
            </button>
            <button onClick={() => setTab("masterdb")}
              className={`px-5 py-2 rounded-md text-[12px] font-medium transition-all duration-200 ${
                tab === "masterdb" ? "bg-gushwork-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              Master DB
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
            <button onClick={() => setRefreshKey((k) => k + 1)}
              className="bg-gushwork-500 hover:bg-gushwork-600 text-white px-4 py-1.5 rounded-lg text-[11px] font-medium transition-all shadow-sm">
              Refresh
            </button>
          </div>
        </div>

        {/* ─── Burner Email Tab ─── */}
        {tab === "email" && (
          <>
            {emailSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <StatCard
                  label="Total Emails Sent"
                  value={emailSummary.totalSent.toLocaleString()}
                  sub={`${((emailSummary.totalSent / 2_000_000) * 100).toFixed(1)}% of 2,000,000 monthly target`}
                  pct={(emailSummary.totalSent / 2_000_000) * 100}
                />
                <StatCard label="Avg Bounce Rate" value={`${emailSummary.avgBounce}%`} sub="across days" />
                <StatCard label="Unique ≥2 Opens" value={emailSummary.totalUnique2Plus.toLocaleString()} sub="distinct leads in range" />
                <StatCard label="Burner Demos" value={emailSummary.totalBurnerDemos.toLocaleString()} sub="demos booked" />
              </div>
            )}

            {emailLoading && (
              <div className="flex items-center gap-1.5 mb-4">
                <div className="w-3 h-3 border-[1.5px] border-gray-200 border-t-gushwork-500 rounded-full animate-spin" />
                <span className="text-[11px] text-gray-500">Loading...</span>
              </div>
            )}

            {emailError && (
              <div className="bg-rose-50 text-rose-600 rounded-lg p-3 mb-5 text-[11px] border border-rose-200">{emailError}</div>
            )}

            <div className="overflow-x-auto overflow-y-auto max-h-[58vh] rounded-lg bg-white border border-gray-200 mb-6">
              <table className="text-[12px] w-max">
                <thead>
                  <tr>
                    {EMAIL_COLS.map(col => (
                      <th key={col.key} title={col.full} className={thCls}>{col.short}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {emailRows.length === 0 && !emailLoading && (
                    <tr><td colSpan={EMAIL_COLS.length} className="text-center text-gray-400 py-20 text-[12px]">No data for selected range.</td></tr>
                  )}
                  {emailRows.length > 0 && (() => {
                    const totals = computeEmailTotals(emailRows);
                    return (
                      <tr>
                        {EMAIL_COLS.map(col => (
                          <td key={col.key} className={tdTotalCls}>{renderEmailCell(totals, col)}</td>
                        ))}
                      </tr>
                    );
                  })()}
                  {emailRows.map((row) => (
                    <tr key={row.date} className={trCls}>
                      {EMAIL_COLS.map(col => (
                        <td key={col.key} className={tdCls}>{renderEmailCell(row, col)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ─── Daily AE Tracker Tab ─── */}
        {tab === "ae" && (
          <>
            {aeRows.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <StatCard label="Show-ups MTD" value={aeRows[0]?.showups_mtd?.toLocaleString() ?? "0"} sub={`${aeRows[0]?.showup_attainment ?? 0}% of ${aeRows[0]?.showup_target ?? 299}`} pct={Number(aeRows[0]?.showup_attainment ?? 0)} />
                <StatCard label="Demos MTD" value={aeRows[0]?.demos_mtd?.toLocaleString() ?? "0"} sub={`${aeRows[0]?.demo_attainment ?? 0}% of ${aeRows[0]?.demo_target ?? 568}`} pct={Number(aeRows[0]?.demo_attainment ?? 0)} />
                <StatCard label="Closes MTD" value={aeRows[0]?.closes_mtd?.toLocaleString() ?? "0"} sub={`${aeRows[0]?.close_attainment ?? 0}% of ${aeRows[0]?.closes_target ?? 0}`} pct={Number(aeRows[0]?.close_attainment ?? 0)} />
                <StatCard label="ARR Closed MTD" value={`$${(aeRows[0]?.arr_mtd ?? 0).toLocaleString()}`} sub={`${aeRows[0]?.arr_attainment ?? 0}% of $${(aeRows[0]?.arr_target ?? 0).toLocaleString()}`} pct={Number(aeRows[0]?.arr_attainment ?? 0)} />
                <StatCard label="Working Days" value={`${aeRows[0]?.working_days_gone ?? 0} / ${aeRows[0]?.working_days ?? 21}`} sub={`${aeRows[0]?.pct_working_days ?? 0}% gone`} pct={Number(aeRows[0]?.pct_working_days ?? 0)} />
              </div>
            )}

            {aeLoading && (
              <div className="flex items-center gap-1.5 mb-4">
                <div className="w-3 h-3 border-[1.5px] border-gray-200 border-t-gushwork-500 rounded-full animate-spin" />
                <span className="text-[11px] text-gray-500">Loading...</span>
              </div>
            )}

            {aeError && (
              <div className="bg-rose-50 text-rose-600 rounded-lg p-3 mb-5 text-[11px] border border-rose-200">{aeError}</div>
            )}

            <div className="overflow-x-auto overflow-y-auto max-h-[58vh] rounded-lg bg-white border border-gray-200 mb-6">
              <table className="text-[12px] w-max">
                <thead>
                  <tr>
                    {AE_COLS.map(col => (
                      <th key={col.key} title={col.full} className={thCls}>{col.short}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aeRows.length === 0 && !aeLoading && (
                    <tr><td colSpan={AE_COLS.length} className="text-center text-gray-400 py-20 text-[12px]">No data.</td></tr>
                  )}
                  {aeRows.length > 0 && (() => {
                    const t = computeAeTotals(aeRows);
                    return (
                      <tr>
                        {AE_COLS.map(col => {
                          const raw = t[col.key];
                          let content: React.ReactNode;
                          if (col.key === "date") {
                            content = <span className="text-[12px] text-gushwork-700">Total</span>;
                          } else if (col.isPct) {
                            content = renderAttainment(Number(raw));
                          } else if (col.isCurrency) {
                            content = <span className="text-gray-800">${Number(raw ?? 0).toLocaleString()}</span>;
                          } else if (col.key === "working_days_gone") {
                            content = <span className="text-gray-600">{Number(t.working_days_gone ?? 0)} / {aeRows[0]?.working_days ?? 21}</span>;
                          } else {
                            content = <span className="text-gray-800">{fmt(Number(raw))}</span>;
                          }
                          return <td key={col.key} className={tdTotalCls}>{content}</td>;
                        })}
                      </tr>
                    );
                  })()}
                  {aeRows.map((r) => (
                    <tr key={r.date} className={trCls}>
                      {AE_COLS.map(col => {
                        const raw = r[col.key];
                        let content: React.ReactNode;
                        if (col.key === "date") {
                          content = <span className="text-[12px] text-gray-700">{String(raw)}</span>;
                        } else if (col.isPct) {
                          content = renderAttainment(Number(raw));
                        } else if (col.isCurrency) {
                          content = <span className="text-gray-800">${Number(raw ?? 0).toLocaleString()}</span>;
                        } else if (col.key === "working_days_gone") {
                          content = <span className="text-gray-600">{r.working_days_gone} / {r.working_days ?? aeRows[0]?.working_days ?? 21}</span>;
                        } else {
                          content = <span className="text-gray-800">{fmt(Number(raw))}</span>;
                        }
                        return <td key={col.key} className={tdCls}>{content}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ─── Cold Calling Tab ─── */}
        {tab === "calls" && (
          <>
            {callSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <StatCard label="Calls MTD" value={callSummary.callsMtd.toLocaleString()} sub={`${callSummary.callsAttainment}% of ${callSummary.callTarget.toLocaleString()} target`} pct={Number(callSummary.callsAttainment)} />
                <StatCard label="Demos Scheduled MTD" value={callSummary.demoScheduledMtd.toLocaleString()} sub={`${callSummary.demoAttainment}% of ${callSummary.demoPlan} target`} pct={Number(callSummary.demoAttainment)} />
                <StatCard label="Showups MTD" value={callSummary.showupsMtd.toLocaleString()} sub={`${callSummary.showupAttainment}% of ${callSummary.showupPlan} target`} pct={Number(callSummary.showupAttainment)} />
                <StatCard label="Showup Attainment" value={`${callSummary.showupAttainment}%`} sub={`vs ${callSummary.showupPlan} plan`} pct={Number(callSummary.showupAttainment)} />
              </div>
            )}

            {callLoading && (
              <div className="flex items-center gap-1.5 mb-4">
                <div className="w-3 h-3 border-[1.5px] border-gray-200 border-t-gushwork-500 rounded-full animate-spin" />
                <span className="text-[11px] text-gray-500">Loading...</span>
              </div>
            )}

            {callError && (
              <div className="bg-rose-50 text-rose-600 rounded-lg p-3 mb-5 text-[11px] border border-rose-200">{callError}</div>
            )}

            <div className="overflow-x-auto overflow-y-auto max-h-[58vh] rounded-lg bg-white border border-gray-200 mb-6">
              <table className="text-[12px] w-max">
                <thead>
                  <tr>
                    {CALL_COLS.map(col => (
                      <th key={col.key} title={col.full} className={thCls}>{col.short}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {callRows.length === 0 && !callLoading && (
                    <tr><td colSpan={CALL_COLS.length} className="text-center text-gray-400 py-20 text-[12px]">No data.</td></tr>
                  )}
                  {callRows.length > 0 && (() => {
                    const totals = computeCallTotals(callRows);
                    return (
                      <tr>
                        {CALL_COLS.map(col => (
                          <td key={col.key} className={tdTotalCls}>{renderCallCell(totals, col)}</td>
                        ))}
                      </tr>
                    );
                  })()}
                  {callRows.map((row) => (
                    <tr key={row.date} className={trCls}>
                      {CALL_COLS.map(col => (
                        <td key={col.key} className={tdCls}>{renderCallCell(row, col)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ─── CAC Tracker Tab ─── */}
        {tab === "cost" && (
          <CacTracker
            costRows={costRows}
            costLoading={costLoading}
            costError={costError}
            to={to}
            thCls={thCls}
            tdCls={tdCls}
            tdTotalCls={tdTotalCls}
            trCls={trCls}
            StatCard={StatCard}
          />
        )}

        {/* ─── Burner Contacts Touchpoint DB Tab ─── */}
        {tab === "touchpoint" && (
          <BurnerTouchpointDB
            snapshots={touchpointData}
            loading={touchpointLoading}
            error={touchpointError}
          />
        )}

        {/* ─── Master DB Tab ─── */}
        {tab === "masterdb" && (
          <MasterDB
            rows={masterdbRows}
            loading={masterdbLoading}
            error={masterdbError}
            thCls={thCls}
            tdCls={tdCls}
            tdTotalCls={tdTotalCls}
            trCls={trCls}
            StatCard={StatCard}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Burner Contacts Touchpoint DB (Sequence Funnel) ─── */

type SequenceFunnelData = {
  tam: number;
  rows: { week_start: string; tam: number; sq: number[] }[];
};

function BurnerTouchpointDB({ snapshots, loading, error }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snapshots: any | null;
  loading: boolean;
  error: string | null;
}) {
  const data = snapshots as SequenceFunnelData | null;
  const rows = data?.rows ?? [];
  const tam = data?.tam ?? 0;

  const thC = "px-4 py-3 text-right font-semibold text-[11px] bg-gray-50 border-b border-gray-200 tabular-nums text-gray-700 whitespace-nowrap";
  const thDate = "px-4 py-3 text-left font-semibold whitespace-nowrap text-[11px] bg-gray-50 border-b border-gray-200 text-gray-700";
  const tdC = "px-4 py-3 whitespace-nowrap text-[12px] tabular-nums border-b border-gray-100 text-right";
  const tdDate = "px-4 py-3 whitespace-nowrap text-[12px] border-b border-gray-100 text-left font-medium text-gray-700";

  const n = (v: number) => v.toLocaleString();
  const pct = (v: number, total: number) => total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "—";

  const SQ_LABELS = Array.from({ length: 12 }, (_, i) => `SQ${i + 1}`);
  const SQ_SUBTITLES = [
    "T1 Seq 1", "T1 Seq 2", "T1 Seq 3",
    "T2 Seq 1", "T2 Seq 2", "T2 Seq 3", "T2 Seq 4", "T2 Seq 5", "T2 Seq 6",
    "T3 Seq 1", "T3 Seq 2", "T3 Seq 3",
  ];

  return (
    <>
      {loading && (
        <div className="flex items-center gap-1.5 mb-4 mx-6">
          <div className="w-3 h-3 border-[1.5px] border-gray-200 border-t-gushwork-500 rounded-full animate-spin" />
          <span className="text-[11px] text-gray-500">Loading...</span>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 text-rose-600 rounded-lg p-3 mb-5 text-[11px] border border-rose-200 mx-6">{error}</div>
      )}

      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 mx-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-[11px] text-gushwork-600 font-medium mb-1">Total TAM</div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">{n(tam)}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">unique leads in repo</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-[11px] text-gushwork-600 font-medium mb-1">SQ1 Coverage</div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">{pct(rows[rows.length - 1].sq[0], tam)}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{n(rows[rows.length - 1].sq[0])} leads reached</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-[11px] text-gushwork-600 font-medium mb-1">All 12 SQ Complete</div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">{pct(rows[rows.length - 1].sq[11], tam)}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{n(rows[rows.length - 1].sq[11])} leads</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-[11px] text-gushwork-600 font-medium mb-1">Weeks Tracked</div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">{rows.length}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{rows[0].week_start} → {rows[rows.length - 1].week_start}</div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto overflow-y-auto max-h-[65vh] rounded-lg bg-white border border-gray-200 mb-6">
        <table className="text-[12px] w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={thDate}>Week Start</th>
              <th className={thC}>TAM</th>
              {SQ_LABELS.map((label, i) => (
                <th key={label} className={`${thC}${i === 2 || i === 8 ? " border-r border-gray-200" : ""}`}>
                  <div>{label}</div>
                  <div className="text-[9px] font-normal text-gray-400">{SQ_SUBTITLES[i]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={14} className="text-center text-gray-400 py-20 text-[12px]">No data yet.</td></tr>
            )}
            {rows.map((r, rowIdx) => (
              <tr key={r.week_start} className={`hover:bg-gray-50 transition-colors${rowIdx === rows.length - 1 ? " bg-gushwork-50/40" : ""}`}>
                <td className={tdDate}>
                  {r.week_start}{rowIdx === rows.length - 1 ? " (latest)" : ""}
                </td>
                <td className={`${tdC} font-semibold text-gray-900`}>{n(r.tam)}</td>
                {r.sq.map((val, i) => (
                  <td
                    key={`sq${i}`}
                    className={`${tdC}${i === 2 || i === 8 ? " border-r border-gray-100" : ""}${i === 11 ? " font-semibold text-gray-900" : ""}`}
                    title={`${pct(val, r.tam)} of TAM`}
                  >
                    <div>{n(val)}</div>
                    <div className="text-[9px] text-gray-400">{pct(val, r.tam)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ─── CAC Tracker (SDR cost + other monthly costs + summary) ─── */

type CostValue = number | string;

function Donut({ pct, size = 32, variant = "light" }: { pct: number; size?: number; variant?: "light" | "dark" }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - clamped / 100);
  const trackColor = variant === "dark" ? "rgba(255,255,255,0.25)" : "#E5E7EB";
  const fillColor = variant === "dark" ? "#FFFFFF" : "#2563EB";
  const textColor = variant === "dark" ? "text-white" : "text-gushwork-700";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size/2} cy={size/2} r={radius}
          fill="none" stroke={fillColor} strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          strokeLinecap="round"
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center text-[8px] font-semibold tabular-nums ${textColor}`}>
        {Math.round(pct)}%
      </div>
    </div>
  );
}

type MonthlyOtherCosts = {
  justcall: CostValue;
  enrichment: CostValue;
  smartleadMailbox: CostValue;
  smartleadSubscription: CostValue;
  zapmail: CostValue;
  industrySelect: CostValue;
};

const OTHER_COSTS: Record<string, MonthlyOtherCosts> = {
  "2026-04": {
    justcall: 1213.37,
    enrichment: "To be invoiced",
    smartleadMailbox: 2250,
    smartleadSubscription: 1856,
    zapmail: 9152.10,
    industrySelect: 9000,
  },
  "2026-05": {
    justcall: "To be invoiced",
    enrichment: "To be invoiced",
    smartleadMailbox: "To be invoiced",
    smartleadSubscription: "To be invoiced",
    zapmail: "To be invoiced",
    industrySelect: 9000,
  },
};

const SDR_COST_LIMIT = 58000;
const BURNER_INFRA_LIMIT = 15000;
const LEAD_ATTAINMENT_LIMIT = 9000;
const TOTAL_CAC_LIMIT = SDR_COST_LIMIT + BURNER_INFRA_LIMIT + LEAD_ATTAINMENT_LIMIT;

const numOrZero = (v: CostValue) => typeof v === "number" ? v : 0;

type CacTrackerProps = {
  costRows: OutboundCostRow[];
  costLoading: boolean;
  costError: string | null;
  to: string;
  thCls: string;
  tdCls: string;
  tdTotalCls: string;
  trCls: string;
  StatCard: (props: { label: string; value: string; sub?: string; pct?: number }) => React.ReactElement;
};

function CacTracker({ costRows, costLoading, costError, to, thCls, tdCls, tdTotalCls, trCls, StatCard }: CacTrackerProps) {
  const weekGroups = useMemo(() => {
    const map: Record<string, OutboundCostRow[]> = {};
    for (const r of costRows) {
      if (!map[r.week_start]) map[r.week_start] = [];
      map[r.week_start].push(r);
    }
    return Object.entries(map)
      .map(([week, rows]) => {
        const sortedRows = [...rows].sort((a, b) => b.weekly_payout - a.weekly_payout);
        const hours_logged = rows.reduce((s, r) => s + r.hours_logged, 0);
        const capped_hours = rows.reduce((s, r) => s + r.capped_hours, 0);
        const weekly_payout = rows.reduce((s, r) => s + r.weekly_payout, 0);
        return {
          week_start: week,
          sdrs: sortedRows,
          sdr_count: rows.length,
          hours_logged: Number(hours_logged.toFixed(2)),
          capped_hours: Number(capped_hours.toFixed(2)),
          weekly_payout: Number(weekly_payout.toFixed(2)),
          avg_rate: capped_hours > 0 ? Number((weekly_payout / capped_hours).toFixed(2)) : 0,
        };
      })
      .sort((a, b) => b.week_start.localeCompare(a.week_start));
  }, [costRows]);

  const totals = useMemo(() => {
    const hours_logged = weekGroups.reduce((s, w) => s + w.hours_logged, 0);
    const capped_hours = weekGroups.reduce((s, w) => s + w.capped_hours, 0);
    const weekly_payout = weekGroups.reduce((s, w) => s + w.weekly_payout, 0);
    return {
      hours_logged: Number(hours_logged.toFixed(2)),
      capped_hours: Number(capped_hours.toFixed(2)),
      weekly_payout: Number(weekly_payout.toFixed(2)),
      avg_rate: capped_hours > 0 ? Number((weekly_payout / capped_hours).toFixed(2)) : 0,
      week_count: weekGroups.length,
      sdr_weeks: costRows.length,
    };
  }, [weekGroups, costRows.length]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (week: string) => setExpanded(prev => ({ ...prev, [week]: !prev[week] }));

  const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtHrs = (n: number) => n.toFixed(2);
  const fmtCost = (v: CostValue) => typeof v === "number" ? fmtMoney(v) : v;

  const month = (to || "").substring(0, 7);
  const other = OTHER_COSTS[month];

  const sdrCost = totals.weekly_payout;
  const coldCallingCost = other ? numOrZero(other.justcall) + numOrZero(other.enrichment) : 0;
  const burnerInfraCost = other
    ? numOrZero(other.smartleadMailbox) + numOrZero(other.smartleadSubscription) + numOrZero(other.zapmail)
    : 0;
  const leadAttainmentCost = other ? numOrZero(other.industrySelect) : 0;
  const totalCac = sdrCost + coldCallingCost + burnerInfraCost + leadAttainmentCost;
  const totalCacPct = (totalCac / TOTAL_CAC_LIMIT) * 100;
  const sdrPct = (sdrCost / SDR_COST_LIMIT) * 100;
  const burnerInfraPct = (burnerInfraCost / BURNER_INFRA_LIMIT) * 100;
  const leadAttainmentPct = (leadAttainmentCost / LEAD_ATTAINMENT_LIMIT) * 100;

  const monthLabel = month || "—";

  const SectionHeading = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center gap-3 mb-3 mt-2">
      <div className="text-[11px] uppercase tracking-[0.08em] text-gray-500 font-semibold">{children}</div>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );

  const LineItem = ({ label, value }: { label: string; value: CostValue }) => (
    <div className="flex items-baseline justify-between py-2 border-b border-gray-100 last:border-b-0">
      <span className="text-[12px] text-gray-700">{label}</span>
      <span className={`text-[12px] tabular-nums ${typeof value === "number" ? "text-gray-900 font-medium" : "text-gray-400 italic"}`}>
        {fmtCost(value)}
      </span>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-8">
        <div className="bg-gushwork-500 text-white rounded-lg p-5 shadow-sm">
          <div className="text-[11px] text-gushwork-50/90 font-medium mb-1.5 uppercase tracking-wide">Total CAC</div>
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold tabular-nums">{fmtMoney(totalCac)}</div>
            <Donut pct={totalCacPct} variant="dark" />
          </div>
          <div className="text-[10px] text-gushwork-50/80 mt-1">vs {fmtMoney(TOTAL_CAC_LIMIT)} limit · {monthLabel}</div>
        </div>
        <StatCard label="Cold Calling Cost" value={fmtMoney(coldCallingCost)} sub="JustCall + Enrichment" />
        <StatCard label="Burner Infra Cost" value={fmtMoney(burnerInfraCost)} sub={`vs ${fmtMoney(BURNER_INFRA_LIMIT)} limit`} pct={burnerInfraPct} />
        <StatCard label="Lead Attainment" value={fmtMoney(leadAttainmentCost)} sub={`vs ${fmtMoney(LEAD_ATTAINMENT_LIMIT)} limit`} pct={leadAttainmentPct} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="rounded-lg bg-white border border-gray-200 p-5">
          <div className="flex items-baseline justify-between mb-3 pb-3 border-b border-gray-200">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gushwork-600 font-semibold">Cold Calling Cost</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{monthLabel}</div>
            </div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">{fmtMoney(coldCallingCost)}</div>
          </div>
          {other ? (
            <>
              <LineItem label="JustCall" value={other.justcall} />
              <LineItem label="Enrichment" value={other.enrichment} />
            </>
          ) : (
            <div className="text-[11px] text-gray-400 py-3 text-center">No data for {monthLabel}.</div>
          )}
        </div>

        <div className="rounded-lg bg-white border border-gray-200 p-5">
          <div className="flex items-baseline justify-between mb-3 pb-3 border-b border-gray-200">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gushwork-600 font-semibold">Burner Infra Cost</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{monthLabel} · limit {fmtMoney(BURNER_INFRA_LIMIT)}</div>
            </div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">{fmtMoney(burnerInfraCost)}</div>
          </div>
          {other ? (
            <>
              <LineItem label="Smartlead Mailbox" value={other.smartleadMailbox} />
              <LineItem label="Smartlead Subscription" value={other.smartleadSubscription} />
              <LineItem label="Zapmail" value={other.zapmail} />
            </>
          ) : (
            <div className="text-[11px] text-gray-400 py-3 text-center">No data for {monthLabel}.</div>
          )}
        </div>

        <div className="rounded-lg bg-white border border-gray-200 p-5">
          <div className="flex items-baseline justify-between mb-3 pb-3 border-b border-gray-200">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gushwork-600 font-semibold">Lead Attainment</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{monthLabel} · limit {fmtMoney(LEAD_ATTAINMENT_LIMIT)}</div>
            </div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">{fmtMoney(leadAttainmentCost)}</div>
          </div>
          {other ? (
            <LineItem label="Industry Select" value={other.industrySelect} />
          ) : (
            <div className="text-[11px] text-gray-400 py-3 text-center">No data for {monthLabel}.</div>
          )}
        </div>
      </div>

      <SectionHeading>SDR Cost · limit {fmtMoney(SDR_COST_LIMIT)}</SectionHeading>
      {weekGroups.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Weeks in Range" value={totals.week_count.toLocaleString()} sub={`${totals.sdr_weeks} SDR-weeks`} />
          <StatCard label="Total Hours Logged" value={fmtHrs(totals.hours_logged)} sub="all SDRs" />
          <StatCard label="Capped Hours" value={fmtHrs(totals.capped_hours)} sub="payable hours" />
          <StatCard label="Total Cost Paid" value={fmtMoney(totals.weekly_payout)} sub={`vs ${fmtMoney(SDR_COST_LIMIT)} limit · avg $${totals.avg_rate.toFixed(2)}/hr`} pct={sdrPct} />
        </div>
      )}

      {costLoading && (
        <div className="flex items-center gap-1.5 mb-4">
          <div className="w-3 h-3 border-[1.5px] border-gray-200 border-t-gushwork-500 rounded-full animate-spin" />
          <span className="text-[11px] text-gray-500">Loading...</span>
        </div>
      )}

      {costError && (
        <div className="bg-rose-50 text-rose-600 rounded-lg p-3 mb-5 text-[11px] border border-rose-200">{costError}</div>
      )}

      <div className="overflow-x-auto overflow-y-auto max-h-[58vh] rounded-lg bg-white border border-gray-200 mb-8">
        <table className="text-[12px] w-full">
          <thead>
            <tr>
              <th className={thCls} style={{ width: 32 }}></th>
              <th className={thCls} title="Payroll Week Start (Fri)">Week Start</th>
              <th className={thCls} title="Number of SDRs paid this week"># SDRs</th>
              <th className={thCls} title="Total hours logged in Clockify">Total Hours Logged</th>
              <th className={thCls} title="Capped hours (40, or 45 for Michelle)">Capped Hours</th>
              <th className={thCls} title="Total cost paid this week">Total Cost Paid</th>
            </tr>
          </thead>
          <tbody>
            {weekGroups.length === 0 && !costLoading && (
              <tr><td colSpan={6} className="text-center text-gray-400 py-20 text-[12px]">No data for selected range.</td></tr>
            )}
            {weekGroups.length > 0 && (
              <tr>
                <td className={tdTotalCls}></td>
                <td className={tdTotalCls}><span className="text-[12px] text-gushwork-700">Total</span></td>
                <td className={tdTotalCls}><span className="text-gray-800">{totals.sdr_weeks}</span></td>
                <td className={tdTotalCls}><span className="text-gray-800">{fmtHrs(totals.hours_logged)}</span></td>
                <td className={tdTotalCls}><span className="text-gray-800">{fmtHrs(totals.capped_hours)}</span></td>
                <td className={tdTotalCls}><span className="text-gray-800">{fmtMoney(totals.weekly_payout)}</span></td>
              </tr>
            )}
            {weekGroups.map(week => {
              const isOpen = !!expanded[week.week_start];
              return (
                <React.Fragment key={week.week_start}>
                  <tr
                    className={`${trCls} cursor-pointer`}
                    onClick={() => toggle(week.week_start)}
                  >
                    <td className={tdCls}>
                      <span className="inline-block w-4 text-gushwork-600 select-none">{isOpen ? "▾" : "▸"}</span>
                    </td>
                    <td className={tdCls}><span className="text-[12px] text-gray-700">{week.week_start}</span></td>
                    <td className={tdCls}><span className="text-gray-800">{week.sdr_count}</span></td>
                    <td className={tdCls}><span className="text-gray-800">{fmtHrs(week.hours_logged)}</span></td>
                    <td className={tdCls}><span className="text-gray-800">{fmtHrs(week.capped_hours)}</span></td>
                    <td className={tdCls}><span className="text-gray-800">{fmtMoney(week.weekly_payout)}</span></td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="bg-gray-50 border-b border-gray-100 px-6 py-3">
                        <table className="text-[12px] w-full">
                          <thead>
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600 text-[11px]">SDR</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600 text-[11px]">Email</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600 text-[11px]">Hours Logged</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600 text-[11px]">Capped Hrs</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600 text-[11px]">$/Hr</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600 text-[11px]">Weekly Payout</th>
                            </tr>
                          </thead>
                          <tbody>
                            {week.sdrs.map((s, i) => (
                              <tr key={`${week.week_start}-${s.user_email}-${i}`} className="hover:bg-white transition-colors">
                                <td className="px-3 py-2 text-gray-800 tabular-nums">{s.name}</td>
                                <td className="px-3 py-2 text-gray-500 text-[11px] tabular-nums">{s.user_email}</td>
                                <td className="px-3 py-2 text-gray-800 tabular-nums">{fmtHrs(s.hours_logged)}</td>
                                <td className="px-3 py-2 text-gray-800 tabular-nums">{fmtHrs(s.capped_hours)}</td>
                                <td className="px-3 py-2 text-gray-800 tabular-nums">${s.hourly_rate.toFixed(2)}</td>
                                <td className="px-3 py-2 text-gray-800 tabular-nums">{fmtMoney(s.weekly_payout)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

    </>
  );
}

/* ─── Master DB (weekly summary with burner/non-burner filter) ─── */

type MasterDBProps = {
  rows: MasterDBRow[];
  loading: boolean;
  error: string | null;
  thCls: string;
  tdCls: string;
  tdTotalCls: string;
  trCls: string;
  StatCard: (props: { label: string; value: string; sub?: string; pct?: number }) => React.ReactElement;
};

type MasterDBFilter = "all" | "burner" | "nonburner";

function MasterDB({ rows, loading, error, thCls, tdCls, tdTotalCls, trCls, StatCard }: MasterDBProps) {
  const [filter, setFilter] = useState<MasterDBFilter>("all");

  const computed = useMemo(() => {
    return rows.map((r) => {
      const emailed = r.unique_leads_emailed;
      const calledBurner = r.unique_called_burner;
      const calledNonburner = r.unique_called_nonburner;

      let leads_contacted: number;
      let email_only: number;
      let call_email: number;
      let call_only: number;
      let demos: number;
      let showups: number;
      let closes: number;
      let closes_accounts: string[];

      if (filter === "burner") {
        // Burner leads: emailed + called-burner (overlap = call_email)
        email_only = Math.max(emailed - calledBurner, 0);
        call_email = calledBurner;
        call_only = 0;
        leads_contacted = emailed;
        demos = r.demos_burner;
        showups = r.showups_burner;
        closes = r.closes_burner;
        closes_accounts = r.closes_burner_accounts;
      } else if (filter === "nonburner") {
        email_only = 0;
        call_email = 0;
        call_only = calledNonburner;
        leads_contacted = calledNonburner;
        demos = r.demos_nonburner;
        showups = r.showups_nonburner;
        closes = r.closes_nonburner;
        closes_accounts = r.closes_nonburner_accounts;
      } else {
        // All: emailed leads + non-burner calls (burner calls overlap with emailed)
        email_only = Math.max(emailed - calledBurner, 0);
        call_email = calledBurner;
        call_only = calledNonburner;
        leads_contacted = emailed + calledNonburner;
        demos = r.demos_burner + r.demos_nonburner;
        showups = r.showups_burner + r.showups_nonburner;
        closes = r.closes_burner + r.closes_nonburner;
        closes_accounts = [...r.closes_burner_accounts, ...r.closes_nonburner_accounts];
      }

      return {
        week_start: r.week_start,
        leads_contacted,
        email_only,
        call_email,
        call_only,
        demos,
        showups,
        closes,
        closes_accounts,
      };
    });
  }, [rows, filter]);

  const totals = useMemo(() => {
    const sum = (k: keyof (typeof computed)[0]) => computed.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    return {
      leads_contacted: sum("leads_contacted"),
      email_only: sum("email_only"),
      call_email: sum("call_email"),
      call_only: sum("call_only"),
      demos: sum("demos"),
      showups: sum("showups"),
      closes: sum("closes"),
    };
  }, [computed]);

  const COLS = [
    { key: "week_start" as const, short: "Week Start", full: "Week Starting Monday" },
    { key: "leads_contacted" as const, short: "Leads Contacted", full: "# of Unique Leads Contacted" },
    { key: "email_only" as const, short: "Email Only", full: "Leads Contacted via Email Only" },
    { key: "call_email" as const, short: "Call + Email", full: "Leads Contacted via Both Call and Email" },
    { key: "call_only" as const, short: "Call Only", full: "Leads Contacted via Call Only" },
    { key: "demos" as const, short: "Demos", full: "Demos Booked" },
    { key: "showups" as const, short: "Showups", full: "Show-ups (Digital Strategy Meetings)" },
    { key: "closes" as const, short: "Closes", full: "Outbound Closes" },
  ];

  const n = (v: number) => v.toLocaleString();

  return (
    <>
      {/* Filter toggle */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">Filter:</span>
        {(["all", "burner", "nonburner"] as MasterDBFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 ${
              filter === f
                ? "bg-gushwork-500 text-white shadow-sm"
                : "bg-gray-100 text-gray-500 hover:text-gray-700"
            }`}
          >
            {f === "all" ? "All" : f === "burner" ? "Burner" : "Non-Burner"}
          </button>
        ))}
      </div>

      {computed.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total Leads Contacted" value={n(totals.leads_contacted)} sub={`${computed.length} weeks`} />
          <StatCard label="Total Demos" value={n(totals.demos)} sub="demos booked" />
          <StatCard label="Total Showups" value={n(totals.showups)} sub="digital strategy meetings" />
          <StatCard label="Total Closes" value={n(totals.closes)} sub="outbound closes" />
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-1.5 mb-4">
          <div className="w-3 h-3 border-[1.5px] border-gray-200 border-t-gushwork-500 rounded-full animate-spin" />
          <span className="text-[11px] text-gray-500">Loading...</span>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 text-rose-600 rounded-lg p-3 mb-5 text-[11px] border border-rose-200">{error}</div>
      )}

      <div className="overflow-x-auto overflow-y-auto max-h-[58vh] rounded-lg bg-white border border-gray-200 mb-6">
        <table className="text-[12px] w-full">
          <thead>
            <tr>
              {COLS.map(col => (
                <th key={col.key} title={col.full} className={thCls}>{col.short}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {computed.length === 0 && !loading && (
              <tr><td colSpan={COLS.length} className="text-center text-gray-400 py-20 text-[12px]">No data for selected range.</td></tr>
            )}
            {computed.length > 0 && (
              <tr>
                <td className={tdTotalCls}><span className="text-[12px] text-gushwork-700">Total</span></td>
                <td className={tdTotalCls}><span className="text-gray-800">{n(totals.leads_contacted)}</span></td>
                <td className={tdTotalCls}><span className="text-gray-800">{n(totals.email_only)}</span></td>
                <td className={tdTotalCls}><span className="text-gray-800">{n(totals.call_email)}</span></td>
                <td className={tdTotalCls}><span className="text-gray-800">{n(totals.call_only)}</span></td>
                <td className={tdTotalCls}><span className="text-gray-800">{n(totals.demos)}</span></td>
                <td className={tdTotalCls}><span className="text-gray-800">{n(totals.showups)}</span></td>
                <td className={tdTotalCls}><span className="text-gray-800">{n(totals.closes)}</span></td>
              </tr>
            )}
            {computed.map((row) => (
              <tr key={row.week_start} className={trCls}>
                <td className={tdCls}><span className="text-[12px] text-gray-700">{row.week_start}</span></td>
                <td className={tdCls}><span className="text-gray-800">{n(row.leads_contacted)}</span></td>
                <td className={tdCls}><span className="text-gray-800">{n(row.email_only)}</span></td>
                <td className={tdCls}><span className="text-gray-800">{n(row.call_email)}</span></td>
                <td className={tdCls}><span className="text-gray-800">{n(row.call_only)}</span></td>
                <td className={tdCls}><span className="text-gray-800">{n(row.demos)}</span></td>
                <td className={tdCls}><span className="text-gray-800">{n(row.showups)}</span></td>
                <td className={tdCls}>
                  {row.closes > 0 ? (
                    <span
                      className="text-gray-800 underline decoration-dotted decoration-gray-300 cursor-help"
                      title={row.closes_accounts.join("\n")}
                    >{n(row.closes)}</span>
                  ) : (
                    <span className="text-gray-800">{n(row.closes)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
