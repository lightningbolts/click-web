"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FcCard } from "@/components/fc";
import { useInsightsChartTheme } from "@/lib/theme/insightsChartTheme";
import type { PlaceStats } from "@/lib/server/places/stats";

/**
 * Manager-facing Place stats (§7.2 / §7.3). Aggregates only; every chart states its n (rule 3:
 * no thresholds, so a count of 1 is shown as 1). Energy is ordinal, so it uses one sequential
 * hue stepped light → dark rather than categorical colors.
 */

const ENERGY = ["Chill", "Steady", "Lively", "Packed"] as const;
const ENERGY_STEPS = ["#DDD6FE", "#A78BFA", "#7C3AED", "#4C1D95"] as const;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <FcCard className="p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-1 text-2xl font-bold text-on-surface">{value}</p>
      {note ? <p className="mt-1 text-xs text-on-surface-variant">{note}</p> : null}
    </FcCard>
  );
}

function ChartCard({ title, n, children }: { title: string; n: number; children: React.ReactNode }) {
  return (
    <FcCard className="space-y-3 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-bold text-on-surface">{title}</h3>
        <span className="text-xs font-semibold text-on-surface-variant">n = {n}</span>
      </div>
      {children}
    </FcCard>
  );
}

function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-separate" style={{ borderSpacing: 2 }} aria-label="Check-ins by local day and hour">
        <thead>
          <tr>
            <th className="w-10" />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} scope="col" className="text-[10px] font-medium text-on-surface-variant">
                {h % 6 === 0 ? h : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, d) => (
            <tr key={DAYS[d]}>
              <th scope="row" className="pr-1 text-left text-xs font-semibold text-on-surface-variant">
                {DAYS[d]}
              </th>
              {row.map((count, h) => (
                <td
                  key={h}
                  title={`${DAYS[d]} ${String(h).padStart(2, "0")}:00 · ${count} check-in${count === 1 ? "" : "s"}`}
                  className="h-5 rounded-[3px] border border-border-hard/30"
                  style={{ background: count === 0 ? "transparent" : `rgba(124, 58, 237, ${0.15 + 0.85 * (count / max)})` }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SplitBar({ label, yes, no }: { label: string; yes: number; no: number }) {
  const total = yes + no;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-semibold text-on-surface">{label}</span>
        <span className="text-on-surface-variant">
          {yes} yes · {no} no (n = {total})
        </span>
      </div>
      <div className="mt-1 flex h-3 overflow-hidden rounded-full border-2 border-border-hard" aria-hidden>
        <div className="bg-primary" style={{ width: total ? `${(yes / total) * 100}%` : 0 }} />
      </div>
    </div>
  );
}

export default function PlaceStatsView({ stats }: { stats: PlaceStats }) {
  const chart = useInsightsChartTheme();
  const t = stats.totals;
  const energyTotal = sum(stats.energy_distribution);
  const heatTotal = sum(stats.check_ins_by_dow_hour.flat());
  const tooltipStyle = {
    background: chart.tooltipBg,
    border: `1px solid ${chart.tooltipBorder}`,
    color: chart.tooltipText,
    borderRadius: 8,
    fontSize: 12,
  };

  return (
    <div className="space-y-6" data-testid="place-stats">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Check-ins" value={t.check_ins} note={`Last ${stats.range_days} days`} />
        <Tile label="Unique visitors" value={t.unique_visitors} />
        <Tile label="Repeat visitor rate" value={t.repeat_visitor_rate == null ? "—" : `${Math.round(t.repeat_visitor_rate * 100)}%`} />
        <Tile label="Pulses" value={t.pulses} />
        <Tile label="Events hosted" value={t.events_hosted} />
        <Tile label="New connections" value={t.new_connections} note={`${t.repeat_connections} repeat`} />
      </div>

      <ChartCard title="Check-ins by day and hour (local time)" n={heatTotal}>
        <Heatmap grid={stats.check_ins_by_dow_hour} />
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Energy" n={energyTotal}>
          <ul className="space-y-2">
            {stats.energy_distribution.map((count, i) => (
              <li key={ENERGY[i]} className="flex items-center gap-3 text-sm">
                <span className="w-16 font-semibold text-on-surface">{ENERGY[i]}</span>
                <span className="h-3 flex-1 overflow-hidden rounded-full border border-border-hard/40" aria-hidden>
                  <span
                    className="block h-full rounded-full"
                    style={{ width: energyTotal ? `${(count / energyTotal) * 100}%` : 0, background: ENERGY_STEPS[i] }}
                  />
                </span>
                <span className="w-20 text-right text-on-surface-variant">
                  {count} · {pct(count, energyTotal)}
                </span>
              </li>
            ))}
          </ul>
        </ChartCard>
        <ChartCard title="Follow-ups" n={stats.talkable.yes + stats.talkable.no + stats.would_return.yes + stats.would_return.no}>
          <div className="space-y-4">
            <SplitBar label="Easy to talk" yes={stats.talkable.yes} no={stats.talkable.no} />
            <SplitBar label="Would come back" yes={stats.would_return.yes} no={stats.would_return.no} />
          </div>
        </ChartCard>
      </div>

      {stats.daily ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Event check-ins" value={stats.event_vs_regular?.event_check_ins ?? 0} note="During official events" />
            <Tile label="Regular check-ins" value={stats.event_vs_regular?.regular_check_ins ?? 0} />
            <Tile
              label="Median stay"
              value={stats.median_dwell_minutes == null ? "—" : `${stats.median_dwell_minutes} min`}
              note="From people who tapped Leave"
            />
          </div>
          <ChartCard title="Daily check-ins" n={sum(stats.daily.map((d) => d.check_ins))}>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: chart.muted, fontSize: 11 }} stroke={chart.axis} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={{ fill: chart.muted, fontSize: 11 }} stroke={chart.axis} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="check_ins" name="Check-ins" stroke={chart.primary} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="unique_visitors" name="Unique visitors" stroke={chart.muted} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-on-surface-variant">Purple: check-ins · Gray: unique visitors</p>
          </ChartCard>
          <ChartCard title="Average energy by day" n={sum(stats.daily.map((d) => d.pulses))}>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: chart.muted, fontSize: 11 }} stroke={chart.axis} minTickGap={24} />
                  <YAxis
                    domain={[1, 4]}
                    ticks={[1, 2, 3, 4]}
                    tickFormatter={(v: number) => ENERGY[v - 1] ?? ""}
                    tick={{ fill: chart.muted, fontSize: 11 }}
                    stroke={chart.axis}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="avg_energy" name="Average energy" stroke={chart.primary} strokeWidth={2} connectNulls dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          {stats.pulse_by_daypart ? (
            <ChartCard title="Pulse by time of day" n={sum(Object.values(stats.pulse_by_daypart).flat())}>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(["morning", "afternoon", "evening", "night"] as const).map((part) => ({
                      part: part[0].toUpperCase() + part.slice(1),
                      ...Object.fromEntries(ENERGY.map((label, i) => [label, stats.pulse_by_daypart![part][i]])),
                    }))}
                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid stroke={chart.grid} vertical={false} />
                    <XAxis dataKey="part" tick={{ fill: chart.muted, fontSize: 11 }} stroke={chart.axis} />
                    <YAxis allowDecimals={false} tick={{ fill: chart.muted, fontSize: 11 }} stroke={chart.axis} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chart.cursor }} />
                    {ENERGY.map((label, i) => (
                      <Bar key={label} dataKey={label} stackId="energy" fill={ENERGY_STEPS[i]} stroke={chart.tooltipBg} strokeWidth={2} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex flex-wrap gap-3 text-xs text-on-surface-variant">
                {ENERGY.map((label, i) => (
                  <li key={label} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ENERGY_STEPS[i] }} aria-hidden />
                    {label}
                  </li>
                ))}
              </ul>
            </ChartCard>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
