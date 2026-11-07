import clsx from 'clsx';
import { Flame, Sparkles, Target, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { mapLabel, modeLabel } from '../../../shared/labels';
import type { BrawlerMatchPoint, Outcome } from '../../../shared/types';
import { CHART } from '../lib/colors';
import { fmtDateTime, fmtInt, fmtSigned } from '../lib/format';
import { niceTicks } from './charts';

const BRAWLER_MAX_CAP = 3100;
const ALL_MILESTONES = [500, 1000, 1500, 2000, 2500, 3000] as const;

export interface BrawlerProgressionChartProps {
  progression: BrawlerMatchPoint[];
  currentTrophies: number;
  highestTrophies?: number;
  height?: number;
  emptyText?: string;
}

interface MilestoneMeta {
  special: boolean;
  icon: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  badge: string;
}

function getMilestoneMeta(m: number): MilestoneMeta {
  switch (m) {
    case 1000:
      return {
        special: true,
        icon: '★',
        label: 'Palier Élite (1 000 tr.)',
        color: '#f59e0b',
        bgColor: 'rgba(245, 158, 11, 0.12)',
        borderColor: '#f59e0b',
        badge: '1 000 tr. ⭐',
      };
    case 2000:
      return {
        special: true,
        icon: '♚',
        label: 'Palier Maître (2 000 tr.)',
        color: '#8b5cf6',
        bgColor: 'rgba(139, 92, 246, 0.12)',
        borderColor: '#8b5cf6',
        badge: '2 000 tr. 👑',
      };
    case 3000:
      return {
        special: true,
        icon: '🏆',
        label: 'Sommet Cosmique (3 000 tr.)',
        color: '#ec4899',
        bgColor: 'rgba(236, 72, 153, 0.12)',
        borderColor: '#ec4899',
        badge: '3 000 tr. 🏆',
      };
    default:
      return {
        special: false,
        icon: '•',
        label: `Palier ${fmtInt(m)} tr.`,
        color: '#0284c7',
        bgColor: 'rgba(2, 132, 199, 0.08)',
        borderColor: '#38bdf8',
        badge: `${fmtInt(m)} tr.`,
      };
  }
}

function outcomeBadge(outcome?: Outcome | null) {
  if (outcome === 'win') return 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400';
  if (outcome === 'loss') return 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400';
  return 'bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400';
}

function outcomeLabel(outcome?: Outcome | null) {
  if (outcome === 'win') return 'Victoire';
  if (outcome === 'loss') return 'Défaite';
  if (outcome === 'draw') return 'Égalité';
  return null;
}

export function BrawlerProgressionChart({
  progression,
  currentTrophies,
  highestTrophies,
  height = 320,
  emptyText = 'Pas encore d’évolution enregistrée pour ce brawler.',
}: BrawlerProgressionChartProps) {
  const current = currentTrophies ?? progression.at(-1)?.trophies ?? 0;
  const highest = Math.max(highestTrophies ?? current, current);

  // 1. Analyse des paliers majeurs
  const { passedMilestones, milestoneHitMap, upcomingMilestones } = useMemo(() => {
    const passed: { milestone: number; matchIndex: number; time: string; trophies: number }[] = [];
    const hitMap = new Map<number, number>(); // matchIndex -> milestone

    for (const m of ALL_MILESTONES) {
      const hit = progression.find((p) => p.trophies >= m);
      if (hit) {
        passed.push({
          milestone: m,
          matchIndex: hit.matchIndex,
          time: hit.time,
          trophies: hit.trophies,
        });
        // Si plusieurs paliers sont franchis sur un même match, on priorise le plus élevé
        const existing = hitMap.get(hit.matchIndex);
        if (!existing || m > existing) {
          hitMap.set(hit.matchIndex, m);
        }
      }
    }

    const upcoming = ALL_MILESTONES.filter((m) => m > highest && m <= BRAWLER_MAX_CAP);
    return { passedMilestones: passed, milestoneHitMap: hitMap, upcomingMilestones: upcoming };
  }, [progression, highest]);

  // 2. Calcul de la courbe de prédiction sur les 1 000 prochains trophées (cap 3100)
  const { chartData, targetTrophies, deltaTrophies, gainRate, matchesNeeded, predictedMilestones } = useMemo(() => {
    const target = Math.min(current + 1000, BRAWLER_MAX_CAP);
    const delta = Math.max(0, target - current);

    if (progression.length < 2) {
      return {
        chartData: progression,
        targetTrophies: target,
        deltaTrophies: delta,
        gainRate: 0,
        matchesNeeded: 0,
        predictedMilestones: [],
      };
    }

    // Calcul du rythme de gain par partie
    const matchesWithChange = progression.filter((p) => p.matchIndex > 0 && p.change !== null);
    const recent = matchesWithChange.slice(-20);
    const recentGain = recent.length ? recent.reduce((sum, p) => sum + (p.change ?? 0), 0) / recent.length : 0;

    let rate = 6; // valeur par défaut réaliste en ladder Brawl Stars
    if (recentGain >= 1) {
      rate = recentGain;
    } else {
      const allGain = matchesWithChange.length
        ? matchesWithChange.reduce((sum, p) => sum + (p.change ?? 0), 0) / matchesWithChange.length
        : 0;
      if (allGain >= 1) rate = allGain;
    }

    const matchesCount = delta > 0 ? Math.max(10, Math.min(220, Math.round(delta / rate))) : 0;

    const lastPoint = progression[progression.length - 1];
    const lastIndex = lastPoint.matchIndex;
    const lastTime = Date.parse(lastPoint.time) || Date.now();

    // Estimation de la cadence temporelle moyenne entre les parties
    let cadenceMs = (24 * 60 * 60 * 1000) / 4; // ~4 parties/jour par défaut
    if (progression.length >= 5) {
      const firstTime = Date.parse(progression[0].time);
      const span = lastTime - firstTime;
      if (span > 0 && progression.length > 1) {
        cadenceMs = span / (progression.length - 1);
      }
    }

    // Génération des points de prédiction
    const steps = Math.min(matchesCount, 16);
    const predictedPoints: Array<BrawlerMatchPoint & { prediction: number; isPrediction: boolean }> = [];
    const predMilestones: { milestone: number; matchIndex: number; dateIso: string }[] = [];

    if (delta > 0 && matchesCount > 0) {
      for (let i = 1; i <= steps; i++) {
        const prog = i / steps;
        const mIdx = Math.round(lastIndex + prog * matchesCount);
        const predT = Math.min(BRAWLER_MAX_CAP, Math.round(current + prog * delta));
        const estTime = new Date(lastTime + (mIdx - lastIndex) * cadenceMs).toISOString();

        predictedPoints.push({
          matchIndex: mIdx,
          time: estTime,
          trophies: null as unknown as number,
          prediction: predT,
          isPrediction: true,
          change: null,
        });

        // Détection du palier franchi dans la prédiction
        for (const u of upcomingMilestones) {
          if (predT >= u && !predMilestones.some((pm) => pm.milestone === u)) {
            predMilestones.push({ milestone: u, matchIndex: mIdx, dateIso: estTime });
          }
        }
      }
    }

    // Fusion avec jonction exacte au dernier point réel
    const merged = [
      ...progression.map((p, idx) => ({
        ...p,
        // Au dernier point réel, on initialise la prédiction pour une jonction sans rupture
        prediction: idx === progression.length - 1 && delta > 0 ? p.trophies : null,
        isPrediction: false,
      })),
      ...predictedPoints,
    ];

    return {
      chartData: merged,
      targetTrophies: target,
      deltaTrophies: delta,
      gainRate: rate,
      matchesNeeded: matchesCount,
      predictedMilestones: predMilestones,
    };
  }, [progression, current, upcomingMilestones]);

  if (!progression || progression.length < 2) {
    return (
      <div style={{ height }} className="grid place-items-center rounded-2xl bg-fill/60 px-6 text-center text-[13px] text-ink-2">
        {emptyText}
      </div>
    );
  }

  // Ticks et limites des axes
  const allTrophies = chartData
    .map((d) => {
      const pred = (d as { prediction?: number | null }).prediction;
      return typeof pred === 'number' ? pred : d.trophies;
    })
    .filter((v): v is number => v !== null && !Number.isNaN(v));

  const minTrophies = Math.max(0, Math.min(...allTrophies));
  const maxTrophies = Math.max(...allTrophies, targetTrophies);
  const yTicks = niceTicks(minTrophies, maxTrophies, 5);

  const maxMatchIndex = chartData[chartData.length - 1]?.matchIndex ?? progression.length;
  const xTicks = niceTicks(0, maxMatchIndex, 6);

  return (
    <div className="space-y-4">
      {/* ── Bandeau des Paliers Majeurs ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-fill/50 p-2.5 text-[12px]">
        <span className="flex items-center gap-1.5 font-semibold text-ink-2">
          <Sparkles className="size-3.5 text-amber-500" />
          Paliers :
        </span>

        {ALL_MILESTONES.map((m) => {
          const meta = getMilestoneMeta(m);
          const passed = passedMilestones.find((p) => p.milestone === m);
          const predicted = predictedMilestones.find((p) => p.milestone === m);

          if (passed) {
            return (
              <span
                key={m}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition-transform',
                  meta.special
                    ? 'border shadow-xs'
                    : 'bg-white/80 text-ink ring-1 ring-black/[0.06] dark:bg-zinc-800/80 dark:ring-white/10',
                )}
                style={
                  meta.special
                    ? { backgroundColor: meta.bgColor, color: meta.color, borderColor: meta.borderColor }
                    : undefined
                }
                title={`Atteint à la partie ${passed.matchIndex} (${fmtDateTime(passed.time)})`}
              >
                <span>{meta.icon}</span>
                <span className="font-semibold">{fmtInt(m)}</span>
                <span className="text-[10px] opacity-75">P. {passed.matchIndex}</span>
              </span>
            );
          }

          if (predicted) {
            return (
              <span
                key={m}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-600 dark:text-amber-400"
                title={`Prédiction : atteint vers la partie ${predicted.matchIndex} (${fmtDateTime(predicted.dateIso)})`}
              >
                <span>{meta.icon}</span>
                <span className="font-semibold">{fmtInt(m)}</span>
                <span className="text-[10px] font-normal opacity-85">~P. {predicted.matchIndex}</span>
              </span>
            );
          }

          return (
            <span
              key={m}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-ink-3 opacity-60"
              title="Palier à venir"
            >
              <span>{fmtInt(m)}</span>
            </span>
          );
        })}
      </div>

      {/* ── Légende & Indicateur de la prédiction ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-ink-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-blue-600" />
            <span className="font-medium text-ink">Historique ({progression.length - 1} combats)</span>
          </div>
          {deltaTrophies > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full border-b-2 border-dashed border-amber-500" />
              <span className="font-medium text-amber-600 dark:text-amber-400">
                Prédiction (+{fmtInt(deltaTrophies)} tr., cap {fmtInt(BRAWLER_MAX_CAP)})
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-ink-3">
          <span>Axe X : <strong>Parties jouées</strong></span>
          <span>·</span>
          <span>Survol : <strong>Date & heure</strong></span>
        </div>
      </div>

      {/* ── Graphique Recharts ── */}
      <div style={{ height }} role="img" aria-label="Progression des trophées par partie jouée">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 3" />

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
              tickFormatter={(v) => fmtInt(v)}
              tick={{ fill: CHART.tick, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />

            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as BrawlerMatchPoint & { prediction?: number; isPrediction?: boolean };
                if (!p) return null;

                const isPred = p.isPrediction;
                const crossedMilestone = milestoneHitMap.get(p.matchIndex);
                const meta = crossedMilestone ? getMilestoneMeta(crossedMilestone) : null;

                return (
                  <div className="pointer-events-none min-w-[210px] max-w-[280px] rounded-xl bg-white/95 p-3 text-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.08] backdrop-blur dark:bg-zinc-900/95 dark:ring-white/10">
                    {/* Entête */}
                    <div className="flex items-center justify-between border-b border-black/[0.06] pb-2 dark:border-white/10">
                      <span className="font-semibold text-ink">
                        {isPred
                          ? `Projection : Partie ${p.matchIndex}`
                          : p.matchIndex === 0
                            ? 'Point de départ'
                            : `Partie n° ${p.matchIndex}`}
                      </span>
                      {isPred ? (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          Prédiction
                        </span>
                      ) : p.outcome ? (
                        <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-semibold', outcomeBadge(p.outcome))}>
                          {outcomeLabel(p.outcome)}
                        </span>
                      ) : null}
                    </div>

                    {/* Date et Heure précises (exigence utilisateur) */}
                    <div className="mt-2 flex items-center justify-between text-ink-2">
                      <span>Date & heure :</span>
                      <span className="font-medium text-ink tnum">
                        {p.time ? (isPred ? `~${fmtDateTime(p.time)}` : fmtDateTime(p.time)) : '—'}
                      </span>
                    </div>

                    {/* Trophées */}
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-ink-2">Trophées :</span>
                      <span className="font-bold text-ink tnum">
                        {fmtInt(isPred ? p.prediction : p.trophies)} tr.
                      </span>
                    </div>

                    {/* Variation combat */}
                    {!isPred && p.change !== null && (
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

                    {/* Gain projeté */}
                    {isPred && (
                      <div className="mt-1 flex items-center justify-between text-amber-600 dark:text-amber-400">
                        <span>Gain projeté :</span>
                        <span className="font-bold tnum">+{fmtInt((p.prediction ?? 0) - current)} tr.</span>
                      </div>
                    )}

                    {/* Mode & Map */}
                    {!isPred && (p.mode || p.map) && (
                      <div className="mt-2 rounded-lg bg-black/[0.03] px-2 py-1 text-[11px] text-ink-2 dark:bg-white/[0.05]">
                        {p.mode && <span className="font-medium text-ink">{modeLabel(p.mode)}</span>}
                        {p.map && <span> · {mapLabel(p.map) ?? p.map}</span>}
                      </div>
                    )}

                    {/* Alerte Palier Majeur */}
                    {meta && (
                      <div
                        className="mt-2.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold"
                        style={{ backgroundColor: meta.bgColor, color: meta.color, border: `1px solid ${meta.borderColor}` }}
                      >
                        <span className="text-sm">{meta.icon}</span>
                        <span>Palier franchi : {meta.label}</span>
                      </div>
                    )}
                  </div>
                );
              }}
            />

            {/* ── Lignes de référence pour les paliers passés ou cibles ── */}
            {ALL_MILESTONES.map((m) => {
              if (m < minTrophies || m > maxTrophies + 50) return null;
              const meta = getMilestoneMeta(m);

              if (meta.special) {
                return (
                  <ReferenceLine
                    key={m}
                    y={m}
                    stroke={meta.color}
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    label={{
                      value: meta.badge,
                      position: 'insideTopRight',
                      fill: meta.color,
                      fontSize: 11,
                      fontWeight: 700,
                      offset: 6,
                    }}
                  />
                );
              }

              return (
                <ReferenceLine
                  key={m}
                  y={m}
                  stroke="#94a3b8"
                  strokeOpacity={0.4}
                  strokeDasharray="3 3"
                  label={{
                    value: `${fmtInt(m)} tr.`,
                    position: 'insideTopRight',
                    fill: '#64748b',
                    fontSize: 10,
                    offset: 6,
                  }}
                />
              );
            })}

            {/* Plafond Max 3100 si dans la zone */}
            {maxTrophies >= 3050 && (
              <ReferenceLine
                y={BRAWLER_MAX_CAP}
                stroke="#ef4444"
                strokeOpacity={0.6}
                strokeDasharray="2 2"
                label={{
                  value: 'Cap 3 100 tr.',
                  position: 'insideTopRight',
                  fill: '#ef4444',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
            )}

            {/* ── Courbe Réelle (Parties jouées) ── */}
            <Line
              dataKey="trophies"
              type="linear"
              stroke="#2563eb"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              isAnimationActive={true}
              animationDuration={800}
              dot={(props: { cx?: number; cy?: number; payload?: { matchIndex: number; isPrediction?: boolean } }) => {
                const { cx, cy, payload } = props;
                if (!cx || !cy || !payload || payload.isPrediction) return <circle key={`empty-${props.payload?.matchIndex}`} r={0} />;
                const milestone = milestoneHitMap.get(payload.matchIndex);
                if (!milestone) return <circle key={`none-${payload.matchIndex}`} r={0} />;

                const meta = getMilestoneMeta(milestone);
                if (meta.special) {
                  return (
                    <g key={`marker-${payload.matchIndex}`} className="cursor-pointer">
                      <circle cx={cx} cy={cy} r={12} fill={meta.color} fillOpacity={0.25} />
                      <circle cx={cx} cy={cy} r={8} fill={meta.color} stroke="#ffffff" strokeWidth={2} />
                      <text
                        x={cx}
                        y={cy + 3.5}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight="bold"
                        fill="#ffffff"
                        pointerEvents="none"
                      >
                        {meta.icon}
                      </text>
                    </g>
                  );
                }

                return (
                  <g key={`marker-${payload.matchIndex}`} className="cursor-pointer">
                    <circle cx={cx} cy={cy} r={6} fill="#0284c7" fillOpacity={0.25} />
                    <circle cx={cx} cy={cy} r={4} fill="#0284c7" stroke="#ffffff" strokeWidth={1.5} />
                  </g>
                );
              }}
              activeDot={{ r: 5, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 2 }}
            />

            {/* ── Courbe de Prédiction (+1 000 trophées, cap 3100) ── */}
            {deltaTrophies > 0 && (
              <Line
                dataKey="prediction"
                type="linear"
                stroke="#f59e0b"
                strokeWidth={2.2}
                strokeDasharray="5 4"
                strokeLinejoin="round"
                strokeLinecap="round"
                isAnimationActive={true}
                animationDuration={900}
                dot={false}
                activeDot={{ r: 5, fill: '#f59e0b', stroke: '#ffffff', strokeWidth: 2 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Résumé analytique sous le graphique ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl bg-fill/50 p-3">
          <div className="grid size-9 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <TrendingUp className="size-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-3">Rythme estimé</div>
            <div className="text-[14px] font-semibold text-ink tnum">
              +{gainRate.toFixed(1)} tr. <span className="text-[12px] font-normal text-ink-2">/ partie</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-fill/50 p-3">
          <div className="grid size-9 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Target className="size-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-3">Objectif prédiction</div>
            <div className="text-[14px] font-semibold text-ink tnum">
              {fmtInt(targetTrophies)} tr.{' '}
              <span className="text-[12px] font-normal text-ink-2">
                ({targetTrophies === BRAWLER_MAX_CAP ? 'Cap max' : `+${fmtInt(deltaTrophies)} tr.`})
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-fill/50 p-3">
          <div className="grid size-9 place-items-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Flame className="size-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-3">Parties restantes</div>
            <div className="text-[14px] font-semibold text-ink tnum">
              {deltaTrophies === 0 ? (
                'Cap max atteint !'
              ) : (
                <>
                  ≈ {fmtInt(matchesNeeded)}{' '}
                  <span className="text-[12px] font-normal text-ink-2">parties pour la cible</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

