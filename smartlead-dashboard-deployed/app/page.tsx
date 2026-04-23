"use client";

import { useEffect, useState, useCallback } from "react";
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
  { key: "working_days_gone",       short: "Days Gone",         full: "Working Days Gone (of 22)" },
];

/* ─── Component ─── */

export default function Dashboard() {
  const today = new Date().toISOString().split("T")[0];
  const monthStart = currentMonthStart();

  const [tab, setTab] = useState<"email" | "calls" | "ae">("email");

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
    if (val === null) return <span className="text-gray-300">{"—"}</span>;
    const color = val >= 100 ? "text-emerald-600" : val >= 80 ? "text-amber-600" : "text-rose-600";
    return <span className={`font-semibold ${color}`}>{val.toFixed(1)}%</span>;
  }

  function renderEmailCell(row: EmailRow, col: ColDef<EmailRow>) {
    const val = row[col.key];
    if (col.key === "date") return <span className="font-mono text-[12px] text-gray-700">{String(val)}</span>;
    if (col.key === "attainment") return renderAttainment(val as number | null);
    if (val === null || val === undefined) return <span className="text-gray-300">{"—"}</span>;
    return <span className="text-gray-800">{fmt(val as number, col.suffix || "")}</span>;
  }

  function renderCallCell(row: CallRow, col: ColDef<CallRow>) {
    const val = row[col.key];
    if (col.key === "date") return <span className="font-mono text-[12px] text-gray-700">{String(val)}</span>;
    if (col.key === "attainment" || col.key === "showup_attainment" || col.key === "demo_attainment") return renderAttainment(val as number);
    return <span className="text-gray-800">{fmt(val as number, col.suffix || "")}</span>;
  }

  function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold mb-2 text-gushwork-600">{label}</div>
        <div className="text-[22px] font-bold text-gray-900 tracking-tight leading-none">{value}</div>
        {sub && <div className="text-[11px] text-gray-500 mt-1.5">{sub}</div>}
      </div>
    );
  }

  /* ─── Reusable table classes ─── */
  const thCls = "px-4 py-3 text-left font-semibold whitespace-nowrap text-white text-[11px] bg-gushwork-500 border-b border-gushwork-600 first:pl-6";
  const tdCls = "px-4 py-3 whitespace-nowrap text-[12px] tabular-nums border-b border-gray-100 first:pl-6";
  const trCls = "hover:bg-gray-50 transition-colors";

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <div className="border-b border-gray-200 sticky top-0 z-10 bg-white">
        <div className="max-w-[1900px] mx-auto px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-lg text-gushwork-600 font-semibold tracking-tight">GTM Dashboard</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[9px] text-gray-500 uppercase tracking-[0.2em]">Live</span>
          </div>
        </div>
      </div>

      <div className="max-w-[1900px] mx-auto px-8 py-8">
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
                <StatCard label="Total Emails Sent" value={emailSummary.totalSent.toLocaleString()} sub="in selected range" />
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

            <div className="overflow-x-auto overflow-y-auto max-h-[58vh] rounded-lg bg-white border border-gray-200 mx-6 mb-6">
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
                <StatCard label="Show-ups MTD" value={aeRows[0]?.showups_mtd?.toLocaleString() ?? "0"} sub={`${aeRows[0]?.showup_attainment ?? 0}% of ${aeRows[0]?.showup_target ?? 250}`} />
                <StatCard label="Demos MTD" value={aeRows[0]?.demos_mtd?.toLocaleString() ?? "0"} sub={`${aeRows[0]?.demo_attainment ?? 0}% of ${aeRows[0]?.demo_target ?? 550}`} />
                <StatCard label="Closes MTD" value={aeRows[0]?.closes_mtd?.toLocaleString() ?? "0"} sub={`${aeRows[0]?.close_attainment ?? 0}% attainment`} />
                <StatCard label="ARR Closed MTD" value={`$${(aeRows[0]?.arr_mtd ?? 0).toLocaleString()}`} sub={`${aeRows[0]?.arr_attainment ?? 0}% attainment`} />
                <StatCard label="Working Days" value={`${aeRows[0]?.working_days_gone ?? 0} / 22`} sub={`${aeRows[0]?.pct_working_days ?? 0}% gone`} />
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

            <div className="overflow-x-auto overflow-y-auto max-h-[58vh] rounded-lg bg-white border border-gray-200 mx-6 mb-6">
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
                  {aeRows.map((r) => (
                    <tr key={r.date} className={trCls}>
                      {AE_COLS.map(col => {
                        const raw = r[col.key];
                        let content: React.ReactNode;
                        if (col.key === "date") {
                          content = <span className="font-mono text-[12px] text-gray-700">{String(raw)}</span>;
                        } else if (col.isPct) {
                          content = renderAttainment(Number(raw));
                        } else if (col.isCurrency) {
                          content = <span className="text-gray-800">${Number(raw ?? 0).toLocaleString()}</span>;
                        } else if (col.key === "working_days_gone") {
                          content = <span className="text-gray-600">{r.working_days_gone} / 22</span>;
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
                <StatCard label="Calls MTD" value={callSummary.callsMtd.toLocaleString()} sub={`${callSummary.callsAttainment}% of 100K target`} />
                <StatCard label="Demos Scheduled MTD" value={callSummary.demoScheduledMtd.toLocaleString()} sub={`${callSummary.demoAttainment}% of 550 target`} />
                <StatCard label="Showups MTD" value={callSummary.showupsMtd.toLocaleString()} sub={`${callSummary.showupAttainment}% of 250 target`} />
                <StatCard label="Showup Attainment" value={`${callSummary.showupAttainment}%`} sub="vs 250 plan" />
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

            <div className="overflow-x-auto overflow-y-auto max-h-[58vh] rounded-lg bg-white border border-gray-200 mx-6 mb-6">
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
      </div>
    </div>
  );
}
