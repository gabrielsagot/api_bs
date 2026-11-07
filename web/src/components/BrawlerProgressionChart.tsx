import clsx from 'clsx';
import { Flame, Sparkles, Target, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
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
const SPECIAL_MILESTONES = [1000, 2000, 3000] as const;

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
  badge: string;
}

function getMilestoneMeta(m: number): MilestoneMeta {
  switch (m) {
    case 1000:
      return {
        special: true,
        icon: '★',
        label: '1 000 tr. (Élite)',
        color: '#d97706', // amber-600 (bien lisible)
        badge: '1 000 tr. ⭐',
      };
    case 2000:
      return {
        special: true,
        icon: '♚',
        label: '2 000 tr. (Maître)',
        color: '#7c3aed', // purple-600
        badge: '2 000 tr. 👑',
      };
    case 3000:
      return {
        special: true,
        icon: '🏆',
        label: '3 000 tr. (Sommet)',
        color: '#db2777', // pink-600
        badge: '3 000 tr. 🏆',
      };
    default:
      return {
        special: false,
        icon: '•',
        label: `${fmtInt(m)} tr.`,
        color: '#0284c7', // sky-600
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

  // Toggle pour afficher tous les paliers intermédiaires si l'utilisateur le souhaite
  const [showAllMilestones, setShowAllMilestones] = useState(false);

  // 1. Analyse intelligente et filtrage des paliers majeurs
  const { passedMilestones, milestoneHitMap, nextMilestone, relevantMilestones } = useMemo(() => {
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
        // Pour les marqueurs sur la courbe : on priorise les spéciaux (1000, 2000, 3000)
        const existing = hitMap.get(hit.matchIndex);
        const isSpecial = SPECIAL_MILESTONES.includes(m as any);
        if (!existing || isSpecial) {
          hitMap.set(hit.matchIndex, m);
        }
      }
    }

    const upcoming = ALL_MILESTONES.filter((m) => m > highest && m <= BRAWLER_MAX_CAP);
    const next = upcoming[0] ?? null;

    // Filtrage contextuel : si le joueur a dépassé 1500 ou 2000 trophées,
    // on masque les vieux paliers 500 pour ne garder que l'essentiel (1000, 2000, 3000 + dernier palier passé + prochain)
    const lastPassed = passed[passed.length - 1]?.milestone;
    const relevant = ALL_MILESTONES.filter((m) => {
      if (SPECIAL_MILESTONES.includes(m as any)) return true;
      if (m === lastPassed) return true;
      if (m === next) return true;
      // Si l'utilisateur active manuellement "Tous les paliers"
      return false;
    });

    return {
      passedMilestones: passed,
      milestoneHitMap: hitMap,
      upcomingMilestones: upcoming,
      nextMilestone: next,
      relevantMilestones: relevant,
    };
  }, [progression, highest]);

  // 2. Calcul de la courbe de prédiction sur les 1 000 prochains trophées (cap 3100)
  const { chartData, targetTrophies, deltaTrophies, gainRate, matchesNeeded, predictedNextMilestone } = useMemo(() => {
    const target = Math.min(current + 1000, BRAWLER_MAX_CAP);
    const delta = Math.max(0, target - current);

    if (progression.length < 2) {
      return {
        chartData: progression,
        targetTrophies: target,
        deltaTrophies: delta,
        gainRate: 0,
        matchesNeeded: 0,
        predictedNextMilestone: null,
      };
    }

    // Calcul du rythme de gain récent par partie
    const matchesWithChange = progression.filter((p) => p.matchIndex > 0 && p.change !== null);
    const recent = matchesWithChange.slice(-20);
    const recentGain = recent.length ? recent.reduce((sum, p) => sum + (p.change ?? 0), 0) / recent.length : 0;

    let rate = 6; // valeur par défaut réaliste en ladder
    if (recentGain >= 1) {
      rate = recentGain;
    } else {
      const allGain = matchesWithChange.length
        ? matchesWithChange.reduce((sum, p) => sum + (p.change ?? 0), 0) / matchesWithChange.length
        : 0;
      if (allGain >= 1) rate = allGain;
    }

    const matchesCount = delta > 0 ? Math.max(10, Math.min(180, Math.round(delta / rate))) : 0;

    const lastPoint = progression[progression.length - 1];
    const lastIndex = lastPoint.matchIndex;
    const lastTime = Date.parse(lastPoint.time) || Date.now();

    // Estimation de la cadence temporelle moyenne entre les parties
    let cadenceMs = (24 * 60 * 60 * 1000) / 4;
    if (progression.length >= 5) {
      const firstTime = Date.parse(progression[0].time);
      const span = lastTime - firstTime;
      if (span > 0 && progression.length > 1) {
        cadenceMs = span / (progression.length - 1);
      }
    }

    // Points de projection pour la seconde courbe
    const steps = Math.min(matchesCount, 14);
    const predictedPoints: Array<BrawlerMatchPoint & { prediction: number; isPrediction: boolean }> = [];
    let predNext: { milestone: number; matchIndex: number; dateIso: string } | null = null;

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

        if (nextMilestone && predT >= nextMilestone && !predNext) {
          predNext = { milestone: nextMilestone, matchIndex: mIdx, dateIso: estTime };
        }
      }
    }

    // Jonction propre et fluide entre la courbe réelle et la prédiction
    const merged = [
      ...progression.map((p, idx) => ({
        ...p,
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
      predictedNextMilestone: predNext,
    };
  }, [progression, current, nextMilestone]);

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
  const yTicks = niceTicks(minTrophies, maxTrophies, 4);

  const maxMatchIndex = chartData[chartData.length - 1]?.matchIndex ?? progression.length;
  const xTicks = niceTicks(0, maxMatchIndex, 5);

  const displayedMilestones = showAllMilestones ? ALL_MILESTONES : relevantMilestones;

  return (
    <div className="space-y-3.5">
      {/* ── Bandeau supérieur épuré : Paliers clés & Prochain objectif ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-fill/40 px-3 py-2 text-[12px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 font-semibold text-ink-2">
            <Sparkles className="size-3.5 text-amber-500" />
            Paliers majeurs :
          </span>

          {displayedMilestones.map((m) => {
            const meta = getMilestoneMeta(m);
            const passed = passedMilestones.find((p) => p.milestone === m);
            const isNext = nextMilestone === m;

            if (passed) {
              return (
                <span
                  key={m}
                  className={clsx(
                    'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition-all',
                    meta.special
                      ? 'border border-current/25 bg-white shadow-2xs dark:bg-zinc-800'
                      : 'bg-white/70 text-ink-2 dark:bg-zinc-800/70',
                  )}
                  style={meta.special ? { color: meta.color } : undefined}
                  title={`Atteint à la partie ${passed.matchIndex} (${fmtDateTime(passed.time)})`}
                >
                  <span className="text-[11px]">{meta.icon}</span>
                  <span className="font-semibold">{fmtInt(m)}</span>
                  <span className="text-[10px] opacity-75">P. {passed.matchIndex}</span>
                </span>
              );
            }

            if (isNext && predictedNextMilestone) {
              return (
                <span
                  key={m}
                  className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-amber-500/50 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-600 dark:text-amber-400"
                  title={`Prochain palier : estimé vers la partie ${predictedNextMilestone.matchIndex}`}
                >
                  <span>{meta.icon}</span>
                  <span className="font-bold">{fmtInt(m)}</span>
                  <span className="text-[10px] font-normal opacity-90">~P. {predictedNextMilestone.matchIndex}</span>
                </span>
              );
            }

            return null;
          })}
        </div>

        {/* Bouton discret pour basculer l'affichage complet de tous les 500 si souhaité */}
        <button
          type="button"
          onClick={() => setShowAllMilestones(!showAllMilestones)}
          className="text-[11px] font-medium text-ink-3 hover:text-accent hover:underline"
        >
          {showAllMilestones ? 'Vue synthétique' : 'Tous les 500 tr.'}
        </button>
      </div>

      {/* ── Légende minimaliste ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full bg-blue-600" />
            <span className="font-medium text-ink">Combats réels ({progression.length - 1})</span>
          </div>
          {deltaTrophies > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 rounded-full border-b-2 border-dashed border-amber-500" />
              <span className="font-medium text-amber-600 dark:text-amber-400">
                Prédiction (+{fmtInt(deltaTrophies)} tr.)
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
          <LineChart data={chartData} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
            {/* Grille horizontale très discrète */}
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
              tickFormatter={(v) => fmtInt(v)}
              tick={{ fill: CHART.tick, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
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
                  <div className="pointer-events-none min-w-[200px] max-w-[270px] rounded-xl bg-white/95 p-3 text-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.08] backdrop-blur dark:bg-zinc-900/95 dark:ring-white/10">
                    <div className="flex items-center justify-between border-b border-black/[0.06] pb-1.5 dark:border-white/10">
                      <span className="font-semibold text-ink">
                        {isPred
                          ? `Partie estimée ${p.matchIndex}`
                          : p.matchIndex === 0
                            ? 'Point de départ'
                            : `Partie n° ${p.matchIndex}`}
                      </span>
                      {isPred ? (
                        <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          Projection
                        </span>
                      ) : p.outcome ? (
                        <span className={clsx('rounded-md px-1.5 py-0.5 text-[10px] font-semibold', outcomeBadge(p.outcome))}>
                          {outcomeLabel(p.outcome)}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-ink-2">
                      <span>Date & heure :</span>
                      <span className="font-medium text-ink tnum">
                        {p.time ? (isPred ? `~${fmtDateTime(p.time)}` : fmtDateTime(p.time)) : '—'}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-ink-2">Trophées :</span>
                      <span className="font-bold text-ink tnum">
                        {fmtInt(isPred ? p.prediction : p.trophies)} tr.
                      </span>
                    </div>

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

                    {isPred && (
                      <div className="mt-1 flex items-center justify-between text-amber-600 dark:text-amber-400">
                        <span>Progression :</span>
                        <span className="font-bold tnum">+{fmtInt((p.prediction ?? 0) - current)} tr.</span>
                      </div>
                    )}

                    {!isPred && (p.mode || p.map) && (
                      <div className="mt-2 rounded-lg bg-black/[0.03] px-2 py-1 text-[11px] text-ink-2 dark:bg-white/[0.05]">
                        {p.mode && <span className="font-medium text-ink">{modeLabel(p.mode)}</span>}
                        {p.map && <span> · {mapLabel(p.map) ?? p.map}</span>}
                      </div>
                    )}

                    {meta && (
                      <div
                        className="mt-2 flex items-center gap-1.5 rounded-lg bg-black/[0.04] px-2 py-1 text-[11px] font-semibold dark:bg-white/[0.06]"
                        style={{ color: meta.color }}
                      >
                        <span>{meta.icon}</span>
                        <span>Palier franchi : {meta.label}</span>
                      </div>
                    )}
                  </div>
                );
              }}
            />

            {/* ── UNE SEULE ligne de référence ciblée : le prochain objectif (évite la saturation) ── */}
            {nextMilestone && nextMilestone <= maxTrophies + 50 && (
              <ReferenceLine
                y={nextMilestone}
                stroke={getMilestoneMeta(nextMilestone).color}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: `Objectif ${getMilestoneMeta(nextMilestone).badge}`,
                  position: 'insideTopRight',
                  fill: getMilestoneMeta(nextMilestone).color,
                  fontSize: 11,
                  fontWeight: 600,
                  offset: 4,
                }}
              />
            )}

            {/* ── Courbe Réelle (Traits épurés, marqueurs discrets uniquement sur 1000/2000/3000) ── */}
            <Line
              dataKey="trophies"
              type="linear"
              stroke="#2563eb"
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeLinecap="round"
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: { matchIndex: number; isPrediction?: boolean } }) => {
                const { cx, cy, payload } = props;
                if (!cx || !cy || !payload || payload.isPrediction) return <circle key={`e-${props.payload?.matchIndex}`} r={0} />;
                const milestone = milestoneHitMap.get(payload.matchIndex);
                if (!milestone) return <circle key={`n-${payload.matchIndex}`} r={0} />;

                const meta = getMilestoneMeta(milestone);
                // Seuls les paliers spéciaux 1000, 2000, 3000 ont un repère visuel direct sur la courbe
                if (meta.special) {
                  return (
                    <g key={`m-${payload.matchIndex}`} className="cursor-pointer">
                      <circle cx={cx} cy={cy} r={5.5} fill={meta.color} stroke="#ffffff" strokeWidth={2} />
                    </g>
                  );
                }

                return <circle key={`none-${payload.matchIndex}`} r={0} />;
              }}
              activeDot={{ r: 4.5, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 2 }}
            />

            {/* ── Courbe de Prédiction (+1 000 trophées, cap 3100) ── */}
            {deltaTrophies > 0 && (
              <Line
                dataKey="prediction"
                type="linear"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="4 4"
                strokeLinejoin="round"
                strokeLinecap="round"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4.5, fill: '#f59e0b', stroke: '#ffffff', strokeWidth: 2 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Résumé synthétique sous le graphique ── */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-fill/40 p-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <TrendingUp className="size-4" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-3">Rythme actuel</div>
            <div className="text-[13px] font-semibold text-ink tnum">
              +{gainRate.toFixed(1)} tr. <span className="text-[11px] font-normal text-ink-2">/ partie</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-xl bg-fill/40 p-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Target className="size-4" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-3">Objectif</div>
            <div className="text-[13px] font-semibold text-ink tnum">
              {fmtInt(targetTrophies)} tr.{' '}
              <span className="text-[11px] font-normal text-ink-2">
                ({targetTrophies === BRAWLER_MAX_CAP ? 'Cap max' : `+${fmtInt(deltaTrophies)} tr.`})
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-xl bg-fill/40 p-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Flame className="size-4" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-3">Parties estimées</div>
            <div className="text-[13px] font-semibold text-ink tnum">
              {deltaTrophies === 0 ? (
                'Cap max atteint !'
              ) : (
                <>
                  ≈ {fmtInt(matchesNeeded)}{' '}
                  <span className="text-[11px] font-normal text-ink-2">pour la cible</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
