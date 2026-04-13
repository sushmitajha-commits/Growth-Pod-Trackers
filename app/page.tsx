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
  cost_lift: number | null;
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
  demos: number;
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
  { key: "emails_2plus_opens",       short: "Unique >=2 Opens",    full: "# of Unique Leads with >=2 Opens (daily)", group: "engagement" },
  { key: "open_2plus_rate",          short: ">=2 Open Rate",       full: "2+ Open to Email Sent Rate", suffix: "%", group: "engagement" },
  { key: "unique_2plus_no_call",     short: ">=2 Opens No Call",   full: "# of Unique Contacts >=2 Opens, No Call", group: "engagement" },
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
  { key: "date",               short: "Date",              full: "Date" },
  { key: "total_calls",        short: "# of Calls",        full: "# of Calls" },
  { key: "calls_mtd",          short: "# Calls MTD",       full: "# of Calls MTD" },
  { key: "target",             short: "Month Target",       full: "# of Calls Month - Target" },
  { key: "attainment",         short: "Attainment",         full: "# of Calls Attainment", suffix: "%" },
  { key: "sales_dialer_calls", short: "SalesDialer",        full: "# SalesDialer Calls" },
  { key: "justcall_calls",     short: "JustCall",           full: "# JustCall Calls" },
  { key: "unique_dials",       short: "Unique Dials",       full: "# of Unique Dials per Day" },
  { key: "demos",              short: "Demos (Call Date)",   full: "# of Demos (Call Date)" },
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

  const [tab, setTab] = useState<"email" | "calls">("email");

  const [from, setFrom]             = useState(monthStart);
  const [to, setTo]                 = useState(today);
  const [emailRows, setEmailRows]   = useState<EmailRow[]>([]);
  const [totalUnique2Plus, setTotalUnique2Plus] = useState(0);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [callRows, setCallRows]     = useState<CallRow[]>([]);
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError]   = useState<string | null>(null);

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
        demos: Number(r.demos ?? 0),
      })));
    } catch (e: unknown) {
      setCallError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setCallLoading(false);
    }
  }, []);

  useEffect(() => { fetchEmail(); }, [fetchEmail]);
  useEffect(() => { fetchCalls(); }, [fetchCalls]);

  /* ─── Summary stats ─── */
  const emailSummary = emailRows.length > 0 ? {
    totalSent: emailRows.reduce((s, r) => s + r.emails_sent, 0),
    avgBounce: (emailRows.reduce((s, r) => s + r.bounce_rate, 0) / emailRows.length).toFixed(2),
    totalBurnerDemos: emailRows.reduce((s, r) => s + (r.demos_burner ?? 0), 0),
    totalUnique2Plus,
  } : null;

  const callSummary = callRows.length > 0 ? {
    totalCalls: callRows.reduce((s, r) => s + r.total_calls, 0),
    totalDemos: callRows.reduce((s, r) => s + r.demos, 0),
    totalUnique: callRows.reduce((s, r) => s + r.unique_dials, 0),
    latestMtd: callRows[0]?.calls_mtd ?? 0,
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
    if (col.key === "attainment") return renderAttainment(val as number);
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

        {/* ─── Cold Calling Tab ─── */}
        {tab === "calls" && (
          <>
            {callSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                <StatCard label="Total Calls" value={callSummary.totalCalls.toLocaleString()} sub="this month" color="blue" />
                <StatCard label="MTD Progress" value={callSummary.latestMtd.toLocaleString()} sub="of 100,000 target" color="amber" />
                <StatCard label="Unique Dials" value={callSummary.totalUnique.toLocaleString()} sub="distinct numbers" color="emerald" />
                <StatCard label="Demos Booked" value={callSummary.totalDemos.toLocaleString()} sub="from calls" color="violet" />
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
                        className="px-4 py-3 text-left font-medium whitespace-nowrap text-white/25 text-[9px] uppercase tracking-[0.12em]">
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
                        <td key={col.key} className="px-4 py-2.5 whitespace-nowrap tabular-nums">
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
