"use client";

import { useEffect, useState, useCallback } from "react";

/* ─── Types ─── */

type EmailRow = {
  date: string;
  emails_sent: number;
  target_emails_sent: number | null;
  attainment: number | null;
  bounce_rate: number;
  inboxes_at_capacity: number;
  domains_at_capacity: number;
  domains_above_reputation: number;
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

const EMAILS_PER_PROSPECT = 12;
const TOTAL_LEADS_IN_REPO = 351533; // 275,875 smartlead + 75,658 master-only

// Email 1-12 mapped to campaign type sequences
// Yet to receive = total repo - leads who received that sequence
const EMAIL_SEQUENCE_MAP = [
  { email: 1,  type: "Type 1", seq: 1, received: 275875, yetToReceive: 75658 },
  { email: 2,  type: "Type 1", seq: 2, received: 252594, yetToReceive: 98939 },
  { email: 3,  type: "Type 1", seq: 3, received: 242597, yetToReceive: 108936 },
  { email: 4,  type: "Type 2", seq: 1, received: 214841, yetToReceive: 136692 },
  { email: 5,  type: "Type 2", seq: 2, received: 191502, yetToReceive: 160031 },
  { email: 6,  type: "Type 2", seq: 3, received: 130675, yetToReceive: 220858 },
  { email: 7,  type: "Type 2", seq: 4, received: 125085, yetToReceive: 226448 },
  { email: 8,  type: "Type 2", seq: 5, received: 114561, yetToReceive: 236972 },
  { email: 9,  type: "Type 2", seq: 6, received: 105499, yetToReceive: 246034 },
  { email: 10, type: "Type 3", seq: 1, received: 134400, yetToReceive: 217133 },
  { email: 11, type: "Type 3", seq: 2, received: 115277, yetToReceive: 236256 },
  { email: 12, type: "Type 3", seq: 3, received: 75162,  yetToReceive: 276371 },
];

const TOTAL_SMARTLEAD = 275875;
const MASTER_ONLY = 75658;

const TYPE1_FUNNEL = [
  { seq: 1, received: 275875, total: 275875 },
  { seq: 2, received: 252594, total: 275875 },
  { seq: 3, received: 242597, total: 275875 },
];

const TYPE2_FUNNEL = [
  { seq: 1, received: 214841, total: 217760 },
  { seq: 2, received: 191502, total: 217760 },
  { seq: 3, received: 130675, total: 217760 },
  { seq: 4, received: 125085, total: 217760 },
  { seq: 5, received: 114561, total: 217760 },
  { seq: 6, received: 105499, total: 217760 },
];

const TYPE3_FUNNEL = [
  { seq: 1, received: 134400, total: 134580 },
  { seq: 2, received: 115277, total: 134580 },
  { seq: 3, received: 75162, total: 134580 },
];

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

/* ─── Helpers ─── */

function fmt(val: number | null | undefined, suffix = ""): string {
  if (val === null || val === undefined) return "\u2014";
  return val.toLocaleString() + suffix;
}

function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

type ColDef<T> = { key: keyof T; short: string; full: string; suffix?: string; group?: string };

/* ─── Column definitions ─── */

const EMAIL_COLS: ColDef<EmailRow>[] = [
  { key: "date",                     short: "Date",               full: "Date", group: "core" },
  { key: "emails_sent",              short: "Emails Sent",        full: "# of Emails Sent", group: "core" },
  { key: "target_emails_sent",       short: "Target Sent",        full: "Target Emails Sent", group: "core" },
  { key: "attainment",               short: "Attainment",         full: "Attainment", suffix: "%", group: "core" },
  { key: "bounce_rate",              short: "Bounce %",           full: "Bounce Rate", suffix: "%", group: "health" },
  { key: "inboxes_at_capacity",      short: "Inboxes @ Cap",      full: "# of Inboxes Used to Capacity", group: "health" },
  { key: "domains_at_capacity",      short: "Domains @ Cap",      full: "# of Domains Used to Capacity", group: "health" },
  { key: "domains_above_reputation", short: "Domains Good Rep",   full: "# of Domains above Acceptable Reputation Score", group: "health" },
  { key: "emails_2plus_opens",       short: "Unique >=2 Opens",   full: "# of Unique Leads with >=2 Opens (daily)", group: "engagement" },
  { key: "open_2plus_rate",          short: ">=2 Open Rate",      full: ">=2 Open to Email Sent Rate", suffix: "%", group: "engagement" },
  { key: "unique_2plus_no_call",     short: ">=2 Opens No Call",  full: "# First-time >=2 Opens with Phone Number", group: "engagement" },
  { key: "calls_burner",             short: "Calls (Burner)",     full: "# of Calls to Burner Email Opens [Incl. Manual Dials]", group: "burner" },
  { key: "demos_burner",             short: "Demos (Burner)",     full: "# of Demos Booked from Burner Emails", group: "burner" },
  { key: "demo_call_rate_burner",    short: "Demo:Call Burner",   full: "Demo to Call Rate - Burner Email", suffix: "%", group: "burner" },
  { key: "calls_non_burner",         short: "Calls (Non-Burner)", full: "# of Calls Made to Non-Burner Email Opens", group: "non_burner" },
  { key: "demos_non_burner",         short: "Demos (Non-Burner)", full: "# of Demos Booked from Non-Burner Email Opens", group: "non_burner" },
  { key: "demo_call_rate_non_burner",short: "Demo:Call Non-Burner",full:"Demo to Call Rate - Non Burner Email", suffix: "%", group: "non_burner" },
  { key: "lift_from_burner",         short: "Burner Lift",        full: "Lift from Burner Email (Rate Difference)", suffix: "%", group: "lift" },
  { key: "if_no_burner",             short: "If No Burner",       full: "If Burner Email Was Not There (Hypothetical Demos)", group: "lift" },
  { key: "difference",               short: "Difference",         full: "Difference (Actual Burner Demos - Hypothetical)", group: "lift" },
];

const CALL_COLS: ColDef<CallRow>[] = [
  { key: "date",                short: "Date",                full: "Date", group: "core" },
  { key: "total_calls",         short: "# of Calls",          full: "# of Calls", group: "core" },
  { key: "calls_mtd",           short: "# Calls MTD",         full: "# of Calls MTD", group: "core" },
  { key: "target",              short: "Month Target",         full: "# of Calls Month - Target", group: "core" },
  { key: "attainment",          short: "Calls Attainment",     full: "# of Calls Attainment", suffix: "%", group: "core" },
  { key: "sales_dialer_calls",  short: "SalesDialer",          full: "# SalesDialer Calls", group: "health" },
  { key: "justcall_calls",      short: "JustCall",             full: "# JustCall Calls", group: "health" },
  { key: "unique_dials",        short: "Unique Dials",         full: "# of Unique Dials per Day", group: "health" },
  { key: "new_contacts",        short: "New Contacts",         full: "# Total New Contacts Loaded", group: "health" },
  { key: "unique_contacts_mtd", short: "Unique MTD",           full: "# of Unique Contacts MTD", group: "health" },
  { key: "monthly_max_contacts",short: "Max Contacts",         full: "Monthly Maximum Unique Contacts (79,000)", group: "health" },
  { key: "pct_contacts_used",   short: "% Contacts Used",      full: "Percentage of Monthly Contacts Used", suffix: "%", group: "health" },
  { key: "demos",               short: "Demos (Call)",         full: "# of Demos (Call Date)", group: "engagement" },
  { key: "demos_scheduled",     short: "Demos (Sched)",        full: "# of Demos (Scheduled)", group: "engagement" },
  { key: "demos_scheduled_mtd", short: "Demos Sched MTD",      full: "# of Demos (Scheduled) MTD", group: "engagement" },
  { key: "demo_plan",           short: "Demo Plan",            full: "# of Demos Plan for Month", group: "engagement" },
  { key: "demo_attainment",     short: "Demo Attainment",      full: "Attainment - Demos", suffix: "%", group: "engagement" },
  { key: "demo_to_call_rate",   short: "Demo:Call Rate",       full: "Demo to Call Rate (Call Date)", suffix: "%", group: "engagement" },
  { key: "showup_rate",         short: "Showup Rate",          full: "Show-up to Demo Rate (Demo Date)", suffix: "%", group: "burner" },
  { key: "showups",             short: "# Showups",            full: "# of Show-ups", group: "burner" },
  { key: "showups_mtd",         short: "Showups MTD",          full: "# of Show-ups MTD", group: "burner" },
  { key: "showup_target",       short: "Target MTD",           full: "#Target MTD", group: "burner" },
  { key: "showup_plan",         short: "Showup Plan",          full: "# of Show-ups Plan (250)", group: "burner" },
  { key: "showup_attainment",   short: "Showup Attainment",    full: "Attainment - Show-ups", suffix: "%", group: "burner" },
  { key: "working_days_gone",   short: "Days Gone",            full: "Working Days Gone", group: "lift" },
  { key: "pct_working_days",    short: "% Days Gone",          full: "Percentage of Working Days Gone", suffix: "%", group: "lift" },
];

const GROUP_BORDER: Record<string, string> = {
  core:       "border-l-blue-500/50",
  health:     "border-l-amber-500/50",
  engagement: "border-l-emerald-500/50",
  burner:     "border-l-violet-500/50",
  non_burner: "border-l-cyan-500/50",
  lift:       "border-l-rose-500/50",
};

/* ─── Component ─── */

export default function Dashboard() {
  const today = new Date().toISOString().split("T")[0];
  const monthStart = currentMonthStart();

  const [tab, setTab] = useState<"email" | "calls" | "funnel" | "capacity" | "demos" | "closes">("email");

  const [from, setFrom]             = useState(monthStart);
  const [to, setTo]                 = useState(today);
  const [emailRows, setEmailRows]   = useState<EmailRow[]>([]);
  const [totalUnique2Plus, setTotalUnique2Plus] = useState(0);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [callRows, setCallRows]     = useState<CallRow[]>([]);
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError]   = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [demoBookings, setDemoBookings] = useState<any[]>([]);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoTotal, setDemoTotal] = useState(0);
  const [demoDateFilter, setDemoDateFilter] = useState<string>("all");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [closesRows, setClosesRows] = useState<any[]>([]);
  const [closesLoading, setClosesLoading] = useState(false);
  const [closesError, setClosesError] = useState<string | null>(null);
  const [closesMonthFilter, setClosesMonthFilter] = useState<string>("all");
  const [closesSourceFilter, setClosesSourceFilter] = useState<string>("all");


  const fetchEmail = useCallback(async () => {
    setEmailLoading(true);
    setEmailError(null);
    try {
      const res = await fetch(`/api/metrics?from=${from}&to=${to}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setEmailRows(json.rows);
      setTotalUnique2Plus(json.totalUnique2Plus ?? 0);
    } catch (e: unknown) {
      setEmailError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setEmailLoading(false);
    }
  }, [from, to]);

  const fetchCalls = useCallback(async () => {
    setCallLoading(true);
    setCallError(null);
    try {
      const res = await fetch("/api/calls");
      const json = await res.json();
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
      setCallError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setCallLoading(false);
    }
  }, []);

  useEffect(() => { fetchEmail(); }, [fetchEmail]);
  const fetchDemos = useCallback(async () => {
    setDemoLoading(true);
    setDemoError(null);
    try {
      const res = await fetch("/api/demo-bookings");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDemoBookings(json.bookings);
      setDemoTotal(json.totalBookings);
    } catch (e: unknown) {
      setDemoError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDemoLoading(false);
    }
  }, []);

  const fetchCloses = useCallback(async () => {
    setClosesLoading(true);
    setClosesError(null);
    try {
      const res = await fetch("/api/closes");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setClosesRows(json.rows);
    } catch (e: unknown) {
      setClosesError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setClosesLoading(false);
    }
  }, []);

  useEffect(() => { fetchCalls(); }, [fetchCalls]);
  useEffect(() => { fetchDemos(); }, [fetchDemos]);
  useEffect(() => { fetchCloses(); }, [fetchCloses]);

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
    showupsMtd: callRows[0]?.showups_mtd ?? 0,
    showupAttainment: callRows[0]?.showup_attainment ?? 0,
    demoScheduledMtd: callRows[0]?.demos_scheduled_mtd ?? 0,
    demoAttainment: callRows[0]?.demo_attainment ?? 0,
  } : null;

  function renderAttainment(val: number | null) {
    if (val === null) return <span className="text-white/15">{"\u2014"}</span>;
    const color = val >= 100 ? "text-emerald-400" : val >= 80 ? "text-amber-400" : "text-rose-400";
    return <span className={`font-semibold ${color}`}>{val.toFixed(1)}%</span>;
  }

  function renderEmailCell(row: EmailRow, col: ColDef<EmailRow>) {
    const val = row[col.key];
    if (col.key === "date") return <span className="font-mono text-[11px] font-medium text-white/60">{String(val)}</span>;
    if (col.key === "attainment") return renderAttainment(val as number | null);
    if (val === null || val === undefined) return <span className="text-white/15">{"\u2014"}</span>;
    return <span className="text-white/75">{fmt(val as number, col.suffix || "")}</span>;
  }

  function renderCallCell(row: CallRow, col: ColDef<CallRow>) {
    const val = row[col.key];
    if (col.key === "date") return <span className="font-mono text-[11px] font-medium text-white/60">{String(val)}</span>;
    if (col.key === "attainment" || col.key === "showup_attainment" || col.key === "demo_attainment") return renderAttainment(val as number);
    return <span className="text-white/75">{fmt(val as number, col.suffix || "")}</span>;
  }

  function StatCard({ label, value, sub, color = "blue" }: { label: string; value: string; sub?: string; color?: string }) {
    const accent = color === "blue" ? "text-blue-400" : color === "emerald" ? "text-emerald-400" : color === "violet" ? "text-violet-400" : "text-amber-400";
    return (
      <div className="bg-white/[0.02] rounded-2xl p-5">
        <div className={`text-[10px] uppercase tracking-[0.15em] font-semibold mb-2 ${accent}`}>{label}</div>
        <div className="text-[22px] font-bold text-white/90 tracking-tight leading-none">{value}</div>
        {sub && <div className="text-[10px] text-white/25 mt-1.5">{sub}</div>}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f1a]">
      {/* Top bar */}
      <div className="border-b border-white/[0.04] sticky top-0 z-10 bg-[#0b0f1a]/90 backdrop-blur-xl">
        <div className="max-w-[1900px] mx-auto px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://cdn.prod.website-files.com/65c292289fb0ea1ff3a84bd3/697c6f8360e1d60efdeb23f1_gushwork-white-logo.webp"
              alt="Gushwork"
              className="h-5 opacity-80"
            />
            <div className="w-px h-4 bg-white/[0.08]" />
            <span className="text-[12px] text-white/30 tracking-tight">GTM Dashboard</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[9px] text-white/20 uppercase tracking-[0.2em]">Live</span>
          </div>
        </div>
      </div>

      <div className="max-w-[1900px] mx-auto px-8 py-8">
        {/* Tabs */}
        <div className="flex items-center bg-white/[0.02] rounded-xl p-1 w-fit mb-8">
          <button onClick={() => setTab("email")}
            className={`px-5 py-2 rounded-lg text-[12px] font-medium transition-all duration-200 ${
              tab === "email" ? "bg-white/[0.08] text-white" : "text-white/30 hover:text-white/50"
            }`}>
            Burner Email
          </button>
          <button onClick={() => setTab("calls")}
            className={`px-5 py-2 rounded-lg text-[12px] font-medium transition-all duration-200 ${
              tab === "calls" ? "bg-white/[0.08] text-white" : "text-white/30 hover:text-white/50"
            }`}>
            Cold Calling
          </button>
          <button onClick={() => setTab("funnel")}
            className={`px-5 py-2 rounded-lg text-[12px] font-medium transition-all duration-200 ${
              tab === "funnel" ? "bg-white/[0.08] text-white" : "text-white/30 hover:text-white/50"
            }`}>
            Email Capacity
          </button>
          <button onClick={() => setTab("capacity")}
            className={`px-5 py-2 rounded-lg text-[12px] font-medium transition-all duration-200 ${
              tab === "capacity" ? "bg-white/[0.08] text-white" : "text-white/30 hover:text-white/50"
            }`}>
            Campaign Funnel
          </button>
          <button onClick={() => setTab("demos")}
            className={`px-5 py-2 rounded-lg text-[12px] font-medium transition-all duration-200 ${
              tab === "demos" ? "bg-white/[0.08] text-white" : "text-white/30 hover:text-white/50"
            }`}>
            Demo Bookings
          </button>
        </div>

        {/* ─── Burner Email Tab ─── */}
        {tab === "email" && (
          <>
            {emailSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                <StatCard label="Total Emails Sent" value={emailSummary.totalSent.toLocaleString()} sub="in selected range" color="blue" />
                <StatCard label="Avg Bounce Rate" value={`${emailSummary.avgBounce}%`} sub="across days" color="amber" />
                <StatCard label="Unique >=2 Opens" value={emailSummary.totalUnique2Plus.toLocaleString()} sub="distinct leads in range" color="emerald" />
                <StatCard label="Burner Demos" value={emailSummary.totalBurnerDemos.toLocaleString()} sub="demos booked" color="violet" />
              </div>
            )}

            <div className="flex items-center gap-2.5 mb-6 flex-wrap">
              <div className="flex items-center gap-2 bg-white/[0.02] rounded-lg px-3 py-1.5">
                <label className="text-[9px] text-white/20 uppercase tracking-[0.15em] font-semibold">From</label>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                  className="bg-transparent border-none text-[12px] text-white/60 outline-none" />
              </div>
              <div className="flex items-center gap-2 bg-white/[0.02] rounded-lg px-3 py-1.5">
                <label className="text-[9px] text-white/20 uppercase tracking-[0.15em] font-semibold">To</label>
                <input type="date" value={to} onChange={e => setTo(e.target.value)}
                  className="bg-transparent border-none text-[12px] text-white/60 outline-none" />
              </div>
              <button onClick={fetchEmail}
                className="bg-white/[0.06] hover:bg-white/[0.10] text-white/70 hover:text-white px-4 py-1.5 rounded-lg text-[11px] font-medium transition-all">
                Refresh
              </button>
              {emailLoading && (
                <div className="flex items-center gap-1.5 ml-1">
                  <div className="w-3 h-3 border-[1.5px] border-white/10 border-t-white/40 rounded-full animate-spin" />
                </div>
              )}
            </div>

            {emailError && (
              <div className="bg-rose-500/5 text-rose-300/80 rounded-xl p-3 mb-5 text-[11px]">{emailError}</div>
            )}

            <div className="overflow-x-auto rounded-xl bg-white/[0.015]">
              <table className="text-[11px] w-max">
                <thead>
                  <tr>
                    {EMAIL_COLS.map(col => (
                      <th key={col.key} title={col.full}
                        className={`px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 ${GROUP_BORDER[col.group || ""] || "border-l-transparent"}`}>
                        {col.short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {emailRows.length === 0 && !emailLoading && (
                    <tr><td colSpan={EMAIL_COLS.length} className="text-center text-white/15 py-20 text-[12px]">No data for selected range.</td></tr>
                  )}
                  {emailRows.map((row, i) => (
                    <tr key={row.date}
                      className={`hover:bg-white/[0.025] transition-colors ${i % 2 !== 0 ? "bg-white/[0.008]" : ""}`}>
                      {EMAIL_COLS.map(col => (
                        <td key={col.key}
                          className={`px-4 py-2.5 whitespace-nowrap tabular-nums border-l-2 ${GROUP_BORDER[col.group || ""] || "border-l-transparent"}`}>
                          {renderEmailCell(row, col)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ─── Email Capacity Tab ─── */}
        {tab === "funnel" && (() => {
          const totalEmailsLeft = EMAIL_SEQUENCE_MAP.reduce((s, d) => s + d.yetToReceive, 0);
          const zeroEmailLeads = MASTER_ONLY;

          return (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
                <StatCard label="Total Leads in Repo" value={TOTAL_LEADS_IN_REPO.toLocaleString()} sub="smartlead + master-only" color="blue" />
                <StatCard label="Emails per Prospect" value={String(EMAILS_PER_PROSPECT)} sub="T1: 3 + T2: 6 + T3: 3" color="emerald" />
                <StatCard label="Zero Emails Received" value={zeroEmailLeads.toLocaleString()} sub="master-only, not in smartlead" color="amber" />
                <StatCard label="Total Emails Left" value={totalEmailsLeft.toLocaleString()} sub="across all 12 sequences" color="violet" />
                <StatCard label="Completed All 12" value={(75162).toLocaleString()} sub="received all sequences" color="blue" />
              </div>

              <div className="overflow-x-auto rounded-xl bg-white/[0.015]">
                <table className="text-[11px] w-full">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-blue-500/50">Email #</th>
                      <th className="px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-cyan-500/50">Campaign Type</th>
                      <th className="px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-cyan-500/50">Sequence</th>
                      <th className="px-4 py-3 text-right font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-emerald-500/50">Received</th>
                      <th className="px-4 py-3 text-right font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-amber-500/50">Yet to Receive</th>
                      <th className="px-4 py-3 text-right font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-violet-500/50">% Received</th>
                      <th className="px-4 py-3 text-right font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-rose-500/50">Emails Left (Capacity)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Zero emails row */}
                    <tr className="bg-amber-500/[0.03] hover:bg-white/[0.025] transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums border-l-2 border-l-blue-500/50">
                        <span className="text-amber-400 font-medium">0</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap border-l-2 border-l-cyan-500/50">
                        <span className="text-amber-400/70">{"\u2014"}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap border-l-2 border-l-cyan-500/50">
                        <span className="text-amber-400/70">{"\u2014"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums border-l-2 border-l-emerald-500/50">
                        <span className="text-white/20">0</span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums border-l-2 border-l-amber-500/50">
                        <span className="text-amber-400 font-medium">{zeroEmailLeads.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums border-l-2 border-l-violet-500/50">
                        <span className="text-rose-400">0%</span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums border-l-2 border-l-rose-500/50">
                        <span className="text-amber-400 font-medium">{(zeroEmailLeads * 12).toLocaleString()}</span>
                      </td>
                    </tr>
                    {EMAIL_SEQUENCE_MAP.map((d, i) => {
                      const pct = ((d.received / TOTAL_LEADS_IN_REPO) * 100).toFixed(1);
                      const typeColor = d.type === "Type 1" ? "text-emerald-400/70" : d.type === "Type 2" ? "text-amber-400/70" : "text-violet-400/70";
                      return (
                        <tr key={d.email}
                          className={`hover:bg-white/[0.025] transition-colors ${i % 2 === 0 ? "bg-white/[0.008]" : ""}`}>
                          <td className="px-4 py-2.5 whitespace-nowrap tabular-nums border-l-2 border-l-blue-500/50">
                            <span className="text-white/60 font-medium">{d.email}</span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap border-l-2 border-l-cyan-500/50">
                            <span className={typeColor}>{d.type}</span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap border-l-2 border-l-cyan-500/50">
                            <span className="text-white/40">Seq {d.seq}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums border-l-2 border-l-emerald-500/50">
                            <span className="text-white/75">{d.received.toLocaleString()}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums border-l-2 border-l-amber-500/50">
                            <span className="text-white/75">{d.yetToReceive.toLocaleString()}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums border-l-2 border-l-violet-500/50">
                            <span className={Number(pct) >= 70 ? "text-emerald-400" : Number(pct) >= 40 ? "text-amber-400" : "text-rose-400"}>
                              {pct}%
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums border-l-2 border-l-rose-500/50">
                            <span className="text-white/75 font-medium">{d.yetToReceive.toLocaleString()}</span>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-white/[0.08] bg-white/[0.02]">
                      <td colSpan={4} className="px-4 py-3 whitespace-nowrap border-l-2 border-l-blue-500/50">
                        <span className="text-white/80 font-semibold text-[10px] uppercase tracking-wider">Total Emails Left</span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums border-l-2 border-l-amber-500/50">
                        <span className="text-white/90 font-semibold">{(totalEmailsLeft + zeroEmailLeads * 12).toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3 border-l-2 border-l-violet-500/50" />
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums border-l-2 border-l-rose-500/50">
                        <span className="text-white/90 font-bold">{(totalEmailsLeft + zeroEmailLeads * 12).toLocaleString()}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-[10px] text-white/20">
                Data as of April 15, 2026. Email 1-3 = Type 1, Email 4-9 = Type 2, Email 10-12 = Type 3. Values are static snapshots.
              </div>
            </>
          );
        })()}

        {/* ─── Campaign Funnel Tab ─── */}
        {tab === "capacity" && (() => {
          const funnels = [
            { label: "Type 1", color: "emerald", maxSeq: 3, data: TYPE1_FUNNEL },
            { label: "Type 2", color: "amber", maxSeq: 6, data: TYPE2_FUNNEL },
            { label: "Type 3", color: "violet", maxSeq: 3, data: TYPE3_FUNNEL },
          ];

          const t1Left = TYPE1_FUNNEL.reduce((s, f) => s + (f.total - f.received), 0);
          const t2Left = TYPE2_FUNNEL.reduce((s, f) => s + (f.total - f.received), 0);
          const t3Left = TYPE3_FUNNEL.reduce((s, f) => s + (f.total - f.received), 0);
          const masterLeft = MASTER_ONLY * 12;
          const grandTotalLeft = t1Left + t2Left + t3Left + masterLeft;

          return (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
                <StatCard label="Smartlead Leads" value={TOTAL_SMARTLEAD.toLocaleString()} sub="in campaign stats" color="blue" />
                <StatCard label="Master-Only Leads" value={MASTER_ONLY.toLocaleString()} sub="not in smartlead, need all 12" color="amber" />
                <StatCard label="Total Repo" value={(TOTAL_SMARTLEAD + MASTER_ONLY).toLocaleString()} sub="all unique leads" color="emerald" />
                <StatCard label="Emails per Prospect" value="12" sub="Type1: 3 + Type2: 6 + Type3: 3" color="violet" />
                <StatCard label="Total Emails Left" value={grandTotalLeft.toLocaleString()} sub="across all types + master" color="blue" />
              </div>

              {/* Master-only callout */}
              <div className="bg-amber-500/[0.04] border border-amber-500/10 rounded-xl p-4 mb-6">
                <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-amber-400 mb-1">Master-Only Leads</div>
                <div className="text-[11px] text-white/50">
                  <span className="text-white/80 font-semibold">{MASTER_ONLY.toLocaleString()}</span> leads from gtm_master (filtered CIDs, max 3 per company) are not in Smartlead yet.
                  They need all 12 emails = <span className="text-white/80 font-semibold">{masterLeft.toLocaleString()}</span> emails to send.
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {funnels.map((f) => {
                  const textColor = f.color === "emerald" ? "text-emerald-400" : f.color === "amber" ? "text-amber-400" : "text-violet-400";
                  const barColor = f.color === "emerald" ? "bg-emerald-500" : f.color === "amber" ? "bg-amber-500" : "bg-violet-500";
                  const barBg = f.color === "emerald" ? "bg-emerald-500/10" : f.color === "amber" ? "bg-amber-500/10" : "bg-violet-500/10";
                  const totalInType = f.data[0].total;
                  const notInType = TOTAL_SMARTLEAD - totalInType;
                  const typeEmailsLeft = f.data.reduce((s, d) => s + (d.total - d.received), 0);
                  const notInTypeEmails = notInType * f.maxSeq;
                  const totalTypeCapacity = typeEmailsLeft + notInTypeEmails;

                  return (
                    <div key={f.label} className="bg-white/[0.02] rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-1">
                        <div className={`text-[11px] uppercase tracking-[0.15em] font-semibold ${textColor}`}>{f.label} Campaign</div>
                        <span className="text-[10px] text-white/25">{f.maxSeq} sequences</span>
                      </div>
                      <div className="text-[10px] text-white/30 mb-4">
                        {totalInType.toLocaleString()} leads entered &middot; {notInType.toLocaleString()} not yet in this type
                      </div>

                      <table className="w-full text-[11px] mb-4">
                        <thead>
                          <tr className="text-white/25 text-[9px] uppercase tracking-[0.12em]">
                            <th className="text-left py-2 font-medium">Seq</th>
                            <th className="text-right py-2 font-medium">Received</th>
                            <th className="text-right py-2 font-medium">Yet to Receive</th>
                            <th className="text-right py-2 font-medium">Emails Left</th>
                            <th className="text-right py-2 font-medium">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.data.map((d) => {
                            const yetTo = d.total - d.received;
                            const pct = d.total > 0 ? ((d.received / d.total) * 100).toFixed(1) : "0.0";
                            return (
                              <tr key={d.seq} className="border-t border-white/[0.03]">
                                <td className="py-2.5 text-white/50 font-medium">Email {d.seq}</td>
                                <td className="py-2.5 text-right text-white/75 tabular-nums">{d.received.toLocaleString()}</td>
                                <td className="py-2.5 text-right text-white/40 tabular-nums">{yetTo.toLocaleString()}</td>
                                <td className="py-2.5 text-right tabular-nums">
                                  <span className="text-white/75 font-medium">{yetTo.toLocaleString()}</span>
                                </td>
                                <td className="py-2.5 text-right tabular-nums">
                                  <span className={Number(pct) >= 80 ? "text-emerald-400" : Number(pct) >= 50 ? "text-amber-400" : "text-rose-400"}>
                                    {pct}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="border-t border-white/[0.06]">
                            <td className="py-2.5 text-white/30 text-[10px]">Not in type</td>
                            <td className="py-2.5 text-right text-white/20 tabular-nums">{"\u2014"}</td>
                            <td className="py-2.5 text-right text-white/40 tabular-nums">{notInType.toLocaleString()}</td>
                            <td className="py-2.5 text-right tabular-nums">
                              <span className="text-white/75 font-medium">{notInTypeEmails.toLocaleString()}</span>
                            </td>
                            <td className="py-2.5 text-right text-white/20 tabular-nums">{"\u2014"}</td>
                          </tr>
                          <tr className="border-t border-white/[0.08] bg-white/[0.02]">
                            <td className="py-3 text-white/80 font-semibold text-[10px] uppercase tracking-wider">Total</td>
                            <td className="py-3" />
                            <td className="py-3" />
                            <td className="py-3 text-right tabular-nums">
                              <span className="text-white/90 font-bold">{totalTypeCapacity.toLocaleString()}</span>
                            </td>
                            <td className="py-3" />
                          </tr>
                        </tbody>
                      </table>

                      {/* Funnel bars */}
                      <div className="space-y-1.5">
                        {f.data.map((d) => {
                          const pct = d.total > 0 ? (d.received / d.total) * 100 : 0;
                          return (
                            <div key={d.seq} className="flex items-center gap-2">
                              <span className="text-[9px] text-white/25 w-5 text-right">{d.seq}</span>
                              <div className={`flex-1 h-5 rounded ${barBg} overflow-hidden`}>
                                <div className={`h-full rounded ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[9px] text-white/30 w-10 text-right">{pct.toFixed(1)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-[10px] text-white/20">Data as of April 15, 2026. Values are static snapshots.</div>
            </>
          );
        })()}

        {/* ─── Demo Bookings Tab ─── */}
        {tab === "demos" && (() => {
          const filteredBookings = demoDateFilter === "all"
            ? demoBookings
            : demoBookings.filter(b => b.call_date === demoDateFilter);
          const allDates = demoBookings.map(b => String(b.call_date)).filter(d => d && d !== "null");
          const uniqueDates = allDates.filter((d, i) => allDates.indexOf(d) === i).sort();

          return (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              <StatCard label="Total Bookings" value={demoTotal.toLocaleString()} sub="this month" color="blue" />
              <StatCard label="Showing" value={filteredBookings.length.toLocaleString()} sub={demoDateFilter === "all" ? "all dates" : demoDateFilter} color="violet" />
              <StatCard label="Showed Up" value={filteredBookings.filter(b => b.show_noshow === 'Y').length.toLocaleString()} sub="confirmed" color="emerald" />
              <StatCard label="No Show / Pending" value={filteredBookings.filter(b => b.show_noshow !== 'Y').length.toLocaleString()} sub="no show or pending" color="amber" />
            </div>

            <div className="flex items-center gap-2.5 mb-6 flex-wrap">
              <div className="flex items-center gap-2 bg-white/[0.02] rounded-lg px-3 py-1.5">
                <label className="text-[9px] text-white/20 uppercase tracking-[0.15em] font-semibold">Call Date</label>
                <select value={demoDateFilter} onChange={e => setDemoDateFilter(e.target.value)}
                  className="bg-transparent border-none text-[12px] text-white/60 outline-none cursor-pointer">
                  <option value="all" className="bg-[#0b0f1a]">All Dates</option>
                  {uniqueDates.map(d => (
                    <option key={d} value={d} className="bg-[#0b0f1a]">
                      {d} ({demoBookings.filter(b => b.call_date === d).length})
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={fetchDemos}
                className="bg-white/[0.06] hover:bg-white/[0.10] text-white/70 hover:text-white px-4 py-1.5 rounded-lg text-[11px] font-medium transition-all">
                Refresh
              </button>
              {demoLoading && (
                <div className="flex items-center gap-1.5 ml-1">
                  <div className="w-3 h-3 border-[1.5px] border-white/10 border-t-white/40 rounded-full animate-spin" />
                </div>
              )}
            </div>

            {demoError && (
              <div className="bg-rose-500/5 text-rose-300/80 rounded-xl p-3 mb-5 text-[11px]">{demoError}</div>
            )}

            <div className="overflow-x-auto rounded-xl bg-white/[0.015]">
              <table className="text-[11px] w-max">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-blue-500/50">Demo Date</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-blue-500/50">Call Date</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-emerald-500/50">Company</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-emerald-500/50">Attendee</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-amber-500/50">Website</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-violet-500/50">SDR</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-violet-500/50">AE</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-rose-500/50">Show/No-Show</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 border-l-cyan-500/50">Campaign</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.length === 0 && !demoLoading && (
                    <tr><td colSpan={9} className="text-center text-white/15 py-20 text-[12px]">No bookings{demoDateFilter !== "all" ? ` on ${demoDateFilter}` : " this month"}.</td></tr>
                  )}
                  {filteredBookings.map((b, i) => (
                    <tr key={i}
                      className={`hover:bg-white/[0.025] transition-colors ${i % 2 !== 0 ? "bg-white/[0.008]" : ""}`}>
                      <td className="px-4 py-2.5 whitespace-nowrap border-l-2 border-l-blue-500/50">
                        <span className="font-mono text-[11px] text-white/60">{b.demo_date}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap border-l-2 border-l-blue-500/50">
                        <span className="font-mono text-[11px] text-white/40">{b.call_date || "\u2014"}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap border-l-2 border-l-emerald-500/50">
                        <span className="text-white/75">{b.account_name}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap border-l-2 border-l-emerald-500/50">
                        <span className="text-white/50">{b.attendee_name}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap border-l-2 border-l-amber-500/50">
                        <span className="text-white/40">{b.website}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap border-l-2 border-l-violet-500/50">
                        <span className="text-white/50">{b.sdr}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap border-l-2 border-l-violet-500/50">
                        <span className="text-white/50">{b.ae}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap border-l-2 border-l-rose-500/50">
                        <span className={b.show_noshow === 'Y' ? "text-emerald-400" : b.show_noshow === 'N' ? "text-rose-400" : "text-white/25"}>
                          {b.show_noshow === 'Y' ? "Showed" : b.show_noshow === 'N' ? "No Show" : b.show_noshow === 'R' ? "Rescheduled" : "\u2014"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap border-l-2 border-l-cyan-500/50">
                        <span className="text-white/30">{b.campaign_id}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
          );
        })()}

        {/* ─── Cold Calling Tab ─── */}
        {tab === "calls" && (
          <>
            {callSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                <StatCard label="Calls MTD" value={callSummary.callsMtd.toLocaleString()} sub={`${callSummary.callsAttainment}% of 100K target`} color="blue" />
                <StatCard label="Demos Scheduled MTD" value={callSummary.demoScheduledMtd.toLocaleString()} sub={`${callSummary.demoAttainment}% of 550 target`} color="amber" />
                <StatCard label="Showups MTD" value={callSummary.showupsMtd.toLocaleString()} sub={`${callSummary.showupAttainment}% of 250 target`} color="emerald" />
                <StatCard label="Showup Attainment" value={`${callSummary.showupAttainment}%`} sub="vs 250 plan" color="violet" />
              </div>
            )}

            <div className="flex items-center gap-2.5 mb-6">
              <div className="bg-white/[0.02] rounded-lg px-3 py-1.5">
                <span className="text-[9px] text-white/20 uppercase tracking-[0.15em] font-semibold">Current Month to Date</span>
              </div>
              <button onClick={fetchCalls}
                className="bg-white/[0.06] hover:bg-white/[0.10] text-white/70 hover:text-white px-4 py-1.5 rounded-lg text-[11px] font-medium transition-all">
                Refresh
              </button>
              {callLoading && (
                <div className="flex items-center gap-1.5 ml-1">
                  <div className="w-3 h-3 border-[1.5px] border-white/10 border-t-white/40 rounded-full animate-spin" />
                </div>
              )}
            </div>

            {callError && (
              <div className="bg-rose-500/5 text-rose-300/80 rounded-xl p-3 mb-5 text-[11px]">{callError}</div>
            )}

            <div className="overflow-x-auto rounded-xl bg-white/[0.015]">
              <table className="text-[11px] w-max">
                <thead>
                  <tr>
                    {CALL_COLS.map(col => (
                      <th key={col.key} title={col.full}
                        className={`px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em] border-l-2 ${GROUP_BORDER[col.group || ""] || "border-l-transparent"}`}>
                        {col.short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {callRows.length === 0 && !callLoading && (
                    <tr><td colSpan={CALL_COLS.length} className="text-center text-white/15 py-20 text-[12px]">No data.</td></tr>
                  )}
                  {callRows.map((row, i) => (
                    <tr key={row.date}
                      className={`hover:bg-white/[0.025] transition-colors ${i % 2 !== 0 ? "bg-white/[0.008]" : ""}`}>
                      {CALL_COLS.map(col => (
                        <td key={col.key}
                          className={`px-4 py-2.5 whitespace-nowrap tabular-nums border-l-2 ${GROUP_BORDER[col.group || ""] || "border-l-transparent"}`}>
                          {renderCallCell(row, col)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
