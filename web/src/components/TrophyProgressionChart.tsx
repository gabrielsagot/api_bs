import clsx from 'clsx';
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { mapLabel, modeLabel } from '../../../shared/labels';
import type { Outcome, TrophyMatchPoint } from '../../../shared/types';
import { BrawlerAvatar } from './avatars';
import { niceTicks } from './charts';
import { CHART } from '../lib/colors';
import { fmtCompact, fmtDateTime, fmtInt, fmtSigned } from '../lib/format';

export interface TrophyProgressionChartProps {
  progression: TrophyMatchPoint[];
  currentTrophies?: number | null;
  height?: number;
  emptyText?: string;
}

function outcomeBadge(outcome?: Outcome | null) {
  if (outcome === 'win') return 'bg-good-soft text-good';
  if (outcome === 'loss') return 'bg-bad-soft text-bad';
  return 'bg-fill text-ink-2';
}

function outcomeLabel(outcome?: Outcome | null) {
  if (outcome === 'win') return 'Victoire';
  if (outcome === 'loss') return 'Défaite';
  if (outcome === 'draw') return 'Égalité';
  return null;
}

function valueAxis(ticks: readonly number[], format: (v: number) => string = fmtCompact) {
  const compact = ticks.map(format);
  const tickFormatter = new Set(compact).size === ticks.length ? format : (v: number) => fmtInt(v);
  const longest = Math.max(...ticks.map((v) => tickFormatter(v).length));
  return { tickFormatter, width: Math.max(40, longest * 7 + 10) };
}

export function TrophyProgressionChart({
  progression,
  height = 280,
  emptyText = 'Pas encore de parties enregistrées sur cette période.',
}: TrophyProgressionChartProps) {
  const { maxMatchIndex, minTrophies, maxTrophies, netChange } = useMemo(() => {
    if (!progression || progression.length === 0) {
      return { maxMatchIndex: 0, minTrophies: 0, maxTrophies: 0, netChange: 0 };
    }
    const maxIdx = progression[progression.length - 1].matchIndex;
    const trophiesList = progression.map((p) => p.trophies);
    const minT = Math.min(...trophiesList);
    const maxT = Math.max(...trophiesList);
    const delta = progression[progression.length - 1].trophies - progression[0].trophies;
    return { maxMatchIndex: maxIdx, minTrophies: minT, maxTrophies: maxT, netChange: delta };
  }, [progression]);

  if (!progression || progression.length < 2) {
    return (
      <div style={{ height }} className="grid place-items-center rounded-2xl bg-fill px-6 text-center text-[13px] text-ink-2">
        {emptyText}
      </div>
    );
  }

  const yTicks = niceTicks(minTrophies, maxTrophies, 4);
  const yAxisProps = valueAxis(yTicks);
  const xTicks = niceTicks(0, maxMatchIndex, 5);

  return (
    <div className="space-y-3">
      {/* ── Légende & repères ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full bg-blue-600" />
            <span className="font-medium text-ink">Combats enregistrés ({progression.length - 1})</span>
          </div>
          <span className={clsx('font-semibold tnum', netChange >= 0 ? 'text-good' : 'text-bad')}>
            {fmtSigned(netChange)} tr. sur la période
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-ink-3">
          <span>Axe X : <strong>Parties jouées</strong></span>
          <span>·</span>
          <span>Survol : <strong>Date & heure</strong></span>
        </div>
      </div>

      {/* ── Graphique Recharts ── */}
      <div style={{ height }} role="img" aria-label="Évolution des trophées par partie jouée">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={progression} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />

            <XAxis
              dataKey="matchIndex"
              type="number"
              domain={[0, maxMatchIndex]}
              ticks={xTicks}
              tickFormatter={(x) => (x === 0 ? 'Départ' : `P. ${x}`)}
              tick={{ fill: CHART.tick, fontSize: 11 }}
              axisLine={{ stroke: CHART.axis }}
              tickLine={false}
            />

            <YAxis
              domain={[yTicks[0], yTicks[yTicks.length - 1]]}
              ticks={yTicks}
              tickFormatter={yAxisProps.tickFormatter}
              tick={{ fill: CHART.tick, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={yAxisProps.width}
            />

            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as TrophyMatchPoint;
                if (!p) return null;

                return (
                  <div className="pointer-events-none min-w-[210px] max-w-[280px] rounded-xl bg-white/98 p-3 text-[12px] shadow-[0_6px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] backdrop-blur">
                    <div className="flex items-center justify-between border-b border-line pb-1.5">
                      <span className="font-semibold text-ink">
                        {p.matchIndex === 0 ? 'Point de départ' : `Partie n° ${p.matchIndex}`}
                      </span>
                      {p.outcome && (
                        <span className={clsx('rounded-md px-1.5 py-0.5 text-[10px] font-semibold', outcomeBadge(p.outcome))}>
                          {outcomeLabel(p.outcome)}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-ink-2">
                      <span>Date & heure :</span>
                      <span className="font-medium text-ink tnum">
                        {p.time ? fmtDateTime(p.time) : '—'}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-ink-2">Trophées totaux :</span>
                      <span className="font-bold text-ink tnum">
                        {fmtInt(p.trophies)} tr.
                      </span>
                    </div>

                    {p.change !== null && (
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-ink-2">Variation :</span>
                        <span
                          className={clsx(
                            'font-bold tnum',
                            p.change > 0 ? 'text-good' : p.change < 0 ? 'text-bad' : 'text-ink-2',
                          )}
                        >
                          {fmtSigned(p.change)} tr.
                        </span>
                      </div>
                    )}

                    {p.brawlerName && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg bg-fill/80 px-2 py-1 text-[11px]">
                        <BrawlerAvatar id={p.brawlerId} name={p.brawlerName} size={20} />
                        <span className="font-medium text-ink">{p.brawlerName}</span>
                      </div>
                    )}

                    {(p.mode || p.map) && (
                      <div className="mt-1 rounded-lg bg-fill/50 px-2 py-1 text-[11px] text-ink-2">
                        {p.mode && <span className="font-medium text-ink">{modeLabel(p.mode)}</span>}
                        {p.map && <span> · {mapLabel(p.map) ?? p.map}</span>}
                      </div>
                    )}
                  </div>
                );
              }}
            />

            <Line
              dataKey="trophies"
              type="linear"
              stroke="#0071e3"
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeLinecap="round"
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4.5, fill: '#0071e3', stroke: '#ffffff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

