import clsx from 'clsx';
import { ChartLine, Table } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { tierName, tierShortName } from '../../../shared/labels';
import type { DailyDelta, SeriesPoint, TierPoint } from '../../../shared/types';
import { CHART } from '../lib/colors';
import { playPoints, playTimeline, type PlayTimeline } from '../lib/playtime';
import { fmtCompact, fmtDayKey, fmtInt, fmtSigned } from '../lib/format';
import { Card, CardHeader } from './ui';

// Graphiques sobres : traits fins de 2 px, grille en filets, info-bulle avec
// réticule, et une vue « tableau » pour chaque graphique.

/** Graduations « rondes » (0 / 50 / 100…) pour des valeurs entières (trophées, points). */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    // Courbe plate : une marge à l'échelle de la valeur (±10 autour de 101 447, ±1 autour de 5).
    const pad = Math.max(1, 10 ** (Math.floor(Math.log10(Math.abs(min) || 1)) - 4) * 10);
    min -= pad;
    max += pad;
  }
  const rough = (max - min) / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const n = rough / power;
  // Jamais de demi-unité : les valeurs affichées sont entières.
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * power);
  const low = Math.floor(min / step) * step;
  const high = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = low; value <= high + step / 2; value += step) ticks.push(Number(value.toFixed(6)));
  return ticks;
}

const axisTick = { fill: CHART.tick, fontSize: 11 };

/** Axe horizontal en temps de jeu (pauses compressées, voir lib/playtime). */
function playXAxisProps(timeline: PlayTimeline) {
  return {
    dataKey: 'x',
    type: 'number' as const,
    domain: [0, Math.max(1, timeline.maxX)],
    ticks: timeline.ticks,
    tickFormatter: (x: number) => timeline.label(x),
    tick: axisTick,
    axisLine: { stroke: CHART.axis },
    tickLine: false,
    interval: 0 as const,
  };
}

/** Marque discrète (bande très claire) à l'emplacement des pauses, là où on ne jouait pas. */
function pauseBands(timeline: PlayTimeline) {
  return timeline.pauses.map((pause) => (
    <ReferenceArea key={pause.x1} x1={pause.x1} x2={pause.x2} fill="#f3f3f6" fillOpacity={1} stroke="none" ifOverflow="hidden" />
  ));
}

/**
 * Format des graduations verticales : compact (« 101,4 k ») tant que chaque graduation
 * garde un libellé distinct, sinon valeur entière (« 101 440 », « 101 450 »…),
 * avec une largeur d'axe adaptée au libellé le plus long.
 */
function valueAxis(ticks: readonly number[], format: (v: number) => string = fmtCompact) {
  const compact = ticks.map(format);
  const tickFormatter = new Set(compact).size === ticks.length ? format : (v: number) => fmtInt(v);
  const longest = Math.max(...ticks.map((v) => tickFormatter(v).length));
  return { tickFormatter, width: Math.max(40, longest * 7 + 10) };
}

// ── Infobulle ─────────────────────────────────────────────────

interface TooltipRow {
  color: string;
  label: string;
  value: string;
}

function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="pointer-events-none min-w-[140px] rounded-xl bg-white/95 px-3 py-2 text-[12px] shadow-[0_6px_24px_rgba(0,0,0,0.10)] ring-1 ring-black/[0.06] backdrop-blur">
      <div className="mb-1 text-ink-2">{title}</div>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="h-[2px] w-3 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden />
          <span className="font-semibold text-ink tnum">{row.value}</span>
          <span className="truncate text-ink-2">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: readonly { value?: unknown; payload?: Record<string, unknown>; dataKey?: unknown; color?: string }[];
  label?: unknown;
}

function formatTooltipDate(time: number): string {
  return new Date(time).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── Carte avec vue tableau ────────────────────────────────────

export interface TableData {
  columns: string[];
  rows: (string | number)[][];
}

export function ChartCard({
  title,
  subtitle,
  action,
  table,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  table?: TableData;
  children: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          <div className="flex items-center gap-2">
            {action}
            {table && (
              <div className="inline-flex rounded-[9px] bg-[#e9e9ee] p-[2px]" role="radiogroup" aria-label="Affichage">
                {(
                  [
                    ['chart', ChartLine, 'Graphique'],
                    ['table', Table, 'Tableau'],
                  ] as const
                ).map(([key, Icon, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={view === key}
                    aria-label={label}
                    title={label}
                    onClick={() => setView(key)}
                    className={clsx(
                      'grid size-[26px] place-items-center rounded-[7px]',
                      view === key ? 'bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-ink-2',
                    )}
                  >
                    <Icon className="size-3.5" strokeWidth={2} />
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />
      {view === 'chart' || !table ? children : <DataGrid table={table} />}
    </Card>
  );
}

function DataGrid({ table }: { table: TableData }) {
  return (
    <div className="max-h-[320px] overflow-auto rounded-xl ring-1 ring-line">
      <table className="w-full text-[13px] tnum">
        <thead className="sticky top-0 bg-surface">
          <tr>
            {table.columns.map((column, index) => (
              <th key={column} className={clsx('px-3 py-2 font-medium text-ink-3', index === 0 ? 'text-left' : 'text-right')}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-line">
              {row.map((cell, index) => (
                <td key={index} className={clsx('px-3 py-1.5', index === 0 ? 'text-left text-ink-2' : 'text-right')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyChart({ height, text = 'Pas encore assez de données pour tracer une courbe.' }: { height: number; text?: string }) {
  return (
    <div style={{ height }} className="grid place-items-center rounded-xl bg-fill/60 px-6 text-center text-[13px] text-ink-2">
      {text}
    </div>
  );
}

// ── Courbe temporelle (une série) ─────────────────────────────

export function TimeSeriesChart({
  points,
  height = 240,
  label = 'Trophées',
  color = CHART.accent,
  emptyText,
}: {
  points: SeriesPoint[];
  height?: number;
  label?: string;
  color?: string;
  emptyText?: string;
}) {
  const { data, timeline } = useMemo(() => {
    const raw = playPoints(points.map((p) => ({ t: Date.parse(p.t), v: p.v })));
    const timeline = playTimeline(raw.map((p) => p.t));
    return { timeline, data: raw.map((p) => ({ ...p, x: timeline.toX(p.t) })) };
  }, [points]);
  if (data.length < 2) return <EmptyChart height={height} text={emptyText} />;
  const values = data.map((d) => d.v);
  const yTicks = niceTicks(Math.min(...values), Math.max(...values), 4);
  return (
    <div style={{ height }} role="img" aria-label={`${label} : de ${fmtInt(values[0])} à ${fmtInt(values[values.length - 1])}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          {pauseBands(timeline)}
          <XAxis {...playXAxisProps(timeline)} />
          <YAxis
            domain={[yTicks[0], yTicks[yTicks.length - 1]]}
            ticks={yTicks}
            {...valueAxis(yTicks)}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
            content={({ active, payload }: TooltipProps) =>
              active && payload?.length ? (
                <TooltipBox
                  title={formatTooltipDate(Number(payload[0].payload?.t))}
                  rows={[{ color, label, value: fmtInt(Number(payload[0].value)) }]}
                />
              ) : null
            }
          />
          <Line
            dataKey="v"
            type="linear"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: CHART.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Rang Ranked (marches d'escalier) ──────────────────────────

export function TierChart({ points, height = 240 }: { points: TierPoint[]; height?: number }) {
  const { data, timeline } = useMemo(() => {
    const raw = playPoints(points.map((p) => ({ t: Date.parse(p.t), v: p.tier })));
    const timeline = playTimeline(raw.map((p) => p.t));
    return { timeline, data: raw.map((p) => ({ ...p, x: timeline.toX(p.t) })) };
  }, [points]);
  if (data.length < 2) {
    return (
      <EmptyChart
        height={height}
        text={
          data.length === 1
            ? `Rang actuel : ${tierName(data[0].v)}. La courbe apparaîtra au prochain changement de rang.`
            : 'Aucune partie classée enregistrée pour l’instant.'
        }
      />
    );
  }
  const tiers = data.map((d) => d.v);
  const low = Math.max(1, Math.min(...tiers) - 1);
  const high = Math.max(...tiers) + 1;
  const range = high - low;
  const ticks: number[] = [];
  for (let tier = low; tier <= high; tier++) {
    if (range <= 7 || (tier - 1) % 3 === 0 || tier === low || tier === high) ticks.push(tier);
  }
  return (
    <div style={{ height }} role="img" aria-label={`Rang : de ${tierName(tiers[0])} à ${tierName(tiers[tiers.length - 1])}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          {pauseBands(timeline)}
          <XAxis {...playXAxisProps(timeline)} />
          <YAxis
            domain={[low, high]}
            ticks={ticks}
            interval={0}
            tickFormatter={(v: number) => tierShortName(v)}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={78}
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
            content={({ active, payload }: TooltipProps) =>
              active && payload?.length ? (
                <TooltipBox
                  title={formatTooltipDate(Number(payload[0].payload?.t))}
                  rows={[{ color: CHART.accent, label: 'Rang', value: tierName(Number(payload[0].value)) }]}
                />
              ) : null
            }
          />
          <Line
            dataKey="v"
            type="stepAfter"
            stroke={CHART.accent}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: CHART.accent, stroke: CHART.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Variations quotidiennes (barres de part et d'autre de zéro) ──

function barPath(x: number, y: number, width: number, height: number, radius: number, roundTop: boolean): string {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  if (roundTop) {
    return `M${x},${y + height}L${x},${y + r}Q${x},${y} ${x + r},${y}L${x + width - r},${y}Q${x + width},${y} ${x + width},${y + r}L${x + width},${y + height}Z`;
  }
  return `M${x},${y}L${x + width},${y}L${x + width},${y + height - r}Q${x + width},${y + height} ${x + width - r},${y + height}L${x + r},${y + height}Q${x},${y + height} ${x},${y + height - r}Z`;
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { delta: number };
}

/** Barre arrondie côté donnée, carrée côté ligne de base. */
function DeltaBar({ x = 0, y = 0, width = 0, height = 0, payload }: BarShapeProps) {
  let top = y;
  let size = height;
  if (size < 0) {
    top += size;
    size = -size;
  }
  if (size < 0.5 || !payload) return null;
  const positive = payload.delta >= 0;
  return <path d={barPath(x, top, width, size, 4, positive)} fill={positive ? CHART.good : CHART.bad} />;
}

export function DailyDeltaChart({ days, height = 200 }: { days: DailyDelta[]; height?: number }) {
  if (!days.length) return <EmptyChart height={height} text="Aucune variation enregistrée sur la période." />;
  const deltas = days.map((d) => d.delta);
  const yTicks = niceTicks(Math.min(0, ...deltas), Math.max(0, ...deltas), 4);
  return (
    <div style={{ height }} role="img" aria-label="Variation quotidienne des trophées">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="day"
            tickFormatter={(day: string) => fmtDayKey(day)}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            domain={[yTicks[0], yTicks[yTicks.length - 1]]}
            ticks={yTicks}
            tickFormatter={(v: number) => fmtSigned(v)}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <ReferenceLine y={0} stroke={CHART.axis} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: 'rgba(0,0,0,0.035)' }}
            content={({ active, payload }: TooltipProps) => {
              const row = payload?.[0]?.payload as DailyDelta | undefined;
              return active && row ? (
                <TooltipBox
                  title={fmtDayKey(row.day)}
                  rows={[
                    { color: row.delta >= 0 ? CHART.good : CHART.bad, label: 'sur la journée', value: fmtSigned(row.delta) },
                    { color: CHART.muted, label: 'en fin de journée', value: fmtInt(row.close) },
                  ]}
                />
              ) : null;
            }}
          />
          <Bar dataKey="delta" maxBarSize={24} shape={(props: BarShapeProps) => <DeltaBar {...props} />} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Plusieurs joueurs ─────────────────────────────────────────

export interface NamedSeries {
  key: string;
  label: string;
  color: string;
  points: SeriesPoint[];
}

/**
 * Rééchantillonne plusieurs séries sur une grille commune en temps de jeu
 * (dernière valeur connue de chaque joueur).
 */
function mergeSeries(series: NamedSeries[], steps: number, relative: boolean) {
  const timeline = playTimeline(
    series.flatMap((s) => playPoints(s.points.map((p) => ({ t: Date.parse(p.t), v: p.v }))).map((p) => p.t)),
  );
  const rows: Record<string, number | null>[] = [];
  if (!series.some((s) => s.points.length)) return { timeline, rows };
  const cursors = series.map(() => 0);
  const bases = series.map((s) => (s.points.length ? s.points[0].v : 0));
  for (let i = 0; i <= steps; i++) {
    const position = (timeline.maxX * i) / steps;
    const x = timeline.toTime(position);
    const row: Record<string, number | null> = { x: position, t: x };
    series.forEach((s, index) => {
      while (cursors[index] + 1 < s.points.length && Date.parse(s.points[cursors[index] + 1].t) <= x) cursors[index]++;
      const point = s.points[cursors[index]];
      const value = point && Date.parse(point.t) <= x ? point.v : null;
      row[s.key] = value === null ? null : relative ? value - bases[index] : value;
    });
    rows.push(row);
  }
  return { timeline, rows };
}

export function MultiSeriesChart({
  series,
  height = 260,
  relative = false,
}: {
  series: NamedSeries[];
  height?: number;
  relative?: boolean;
}) {
  const { timeline, rows: data } = useMemo(() => mergeSeries(series, 160, relative), [series, relative]);
  if (data.length < 2) return <EmptyChart height={height} />;
  const values = data.flatMap((row) => series.map((s) => row[s.key])).filter((v): v is number => v !== null);
  const yTicks = niceTicks(Math.min(...values), Math.max(...values), 4);
  const format = (v: number) => (relative ? fmtSigned(v) : fmtCompact(v));
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]" aria-label="Légende">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-[2px] w-4 rounded-full" style={{ background: s.color }} aria-hidden />
            <span className="font-medium text-ink">{s.label}</span>
          </li>
        ))}
      </ul>
      <div style={{ height }} role="img" aria-label="Comparaison des trophées">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            {pauseBands(timeline)}
            <XAxis {...playXAxisProps(timeline)} />
            <YAxis
              domain={[yTicks[0], yTicks[yTicks.length - 1]]}
              ticks={yTicks}
              {...valueAxis(yTicks, format)}
              tick={axisTick}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
              content={({ active, payload }: TooltipProps) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={formatTooltipDate(Number(payload[0].payload?.t))}
                    rows={series.map((s) => {
                      const value = payload[0].payload?.[s.key];
                      return { color: s.color, label: s.label, value: typeof value === 'number' ? format(value) : '—' };
                    })}
                  />
                ) : null
              }
            />
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                type="linear"
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                connectNulls
                activeDot={{ r: 4, fill: s.color, stroke: CHART.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Mini-courbe ───────────────────────────────────────────────

export function Sparkline({ points, height = 40, color = CHART.accent }: { points: SeriesPoint[]; height?: number; color?: string }) {
  if (points.length < 2) return <div style={{ height }} />;
  const raw = playPoints(points.map((p) => ({ t: Date.parse(p.t), v: p.v })));
  const timeline = playTimeline(raw.map((p) => p.t));
  const xs = raw.map((p) => timeline.toX(p.t));
  const ys = raw.map((p) => p.v);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const width = 100;
  const scaleX = (x: number) => ((x - x0) / Math.max(1, x1 - x0)) * width;
  const scaleY = (y: number) => (y1 === y0 ? height / 2 : height - 3 - ((y - y0) / (y1 - y0)) * (height - 6));
  const d = raw.map((p, i) => `${i ? 'L' : 'M'}${scaleX(xs[i]).toFixed(2)},${scaleY(p.v).toFixed(2)}`).join('');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ height }} className="w-full" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
