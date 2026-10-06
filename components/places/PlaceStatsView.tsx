"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatTile } from "@/components/ds/StatTile";
import { ChartCard as Card } from "@/components/insights/ChartCard";
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
  return <StatTile label={label} value={value} hint={note} />;
}

function ChartCard({ title, n, children }: { title: string; n: number; children: React.ReactNode }) {
  return (
    <Card title={title} subtitle={`n = ${n.toLocaleString("en-US")}`}>
      {children}
    </Card>
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
              <th key={h} scope="col" className="type-badge font-medium text-fg-tertiary">
                {h % 6 === 0 ? h : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, d) => (
            <tr key={DAYS[d]}>
              <th scope="row" className="type-meta pr-1 text-left font-semibold text-fg-secondary">
                {DAYS[d]}
              </th>
              {row.map((count, h) => (
                <td
                  key={h}
                  title={`${DAYS[d]} ${String(h).padStart(2, "0")}:00 · ${count} check-in${count === 1 ? "" : "s"}`}
                  className="h-5 rounded-xs bg-fill-subtle"
                  style={count === 0 ? undefined : { background: `color-mix(in srgb, var(--action) ${Math.round(15 + 85 * (count / max))}%, transparent)` }}
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
      <div className="type-meta flex justify-between">
        <span className="font-semibold text-fg">{label}</span>
        <span className="tabular text-fg-secondary">
          {yes} yes · {no} no (n = {total})
        </span>
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-pill bg-fill-subtle" aria-hidden>
        <div className="rounded-pill bg-action" style={{ width: total ? `${(yes / total) * 100}%` : 0 }} />
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
    borderRadius: "var(--r-sm)",
    boxShadow: "var(--shadow-overlay)",
    fontSize: 13,
  };

  return (
    <div className="flex flex-col gap-6" data-testid="place-stats">
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
              <li key={ENERGY[i]} className="type-meta flex items-center gap-3">
                <span className="w-16 font-semibold text-fg">{ENERGY[i]}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-pill bg-fill-subtle" aria-hidden>
                  <span
                    className="block h-full rounded-full"
                    style={{ width: energyTotal ? `${(count / energyTotal) * 100}%` : 0, background: ENERGY_STEPS[i] }}
                  />
                </span>
                <span className="tabular w-20 text-right text-fg-secondary">
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
            <p className="type-meta text-fg-tertiary">Purple: check-ins · Gray: unique visitors</p>
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
              <ul className="type-meta flex flex-wrap gap-3 text-fg-secondary">
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
