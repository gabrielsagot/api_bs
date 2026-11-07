import clsx from 'clsx';
import { Flame, Info, Sparkles, Target, TrendingUp } from 'lucide-react';
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

const ALL_MILESTONES = [500, 1000, 1500, 2000, 2500, 3000] as const;
const SPECIAL_MILESTONES = [1000, 2000, 3000] as const;
const MIN_MATCHES_FOR_PREDICTION = 3;

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
  pillBg: string;
  pillBorder: string;
  pillText: string;
}

function getMilestoneMeta(m: number): MilestoneMeta {
  switch (m) {
    case 1000:
      return {
        special: true,
        icon: '★',
        label: '1 000 tr. (Élite)',
        color: '#d97706', // amber-600
        badge: '1 000 tr. ⭐',
        pillBg: 'bg-amber-50',
        pillBorder: 'border-amber-200',
        pillText: 'text-amber-800',
      };
    case 2000:
      return {
        special: true,
        icon: '♚',
        label: '2 000 tr. (Maître)',
        color: '#7c3aed', // purple-600
        badge: '2 000 tr. 👑',
        pillBg: 'bg-purple-50',
        pillBorder: 'border-purple-200',
        pillText: 'text-purple-800',
      };
    case 3000:
      return {
        special: true,
        icon: '🏆',
        label: '3 000 tr. (Sommet)',
        color: '#db2777', // pink-600
        badge: '3 000 tr. 🏆',
        pillBg: 'bg-pink-50',
        pillBorder: 'border-pink-200',
        pillText: 'text-pink-800',
      };
    default:
      return {
        special: false,
        icon: '•',
        label: `${fmtInt(m)} tr.`,
        color: '#0284c7', // sky-600
        badge: `${fmtInt(m)} tr.`,
        pillBg: 'bg-white',
        pillBorder: 'border-line',
        pillText: 'text-ink-2',
      };
  }
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

export function BrawlerProgressionChart({
  progression,
  currentTrophies,
  height = 320,
  emptyText = 'Pas encore d’évolution enregistrée pour ce brawler.',
}: BrawlerProgressionChartProps) {
  const current = currentTrophies ?? progression.at(-1)?.trophies ?? 0;

  // Toggle pour afficher tous les paliers 500 si l'utilisateur le souhaite
  const [showAllMilestones, setShowAllMilestones] = useState(false);

  // 1. Analyse intelligente et filtrage contextuel des paliers majeurs
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
        const existing = hitMap.get(hit.matchIndex);
        const isSpecial = SPECIAL_MILESTONES.includes(m as any);
        if (!existing || isSpecial) {
          hitMap.set(hit.matchIndex, m);
        }
      }
    }

    // La prochaine cible majeure est le prochain millier
    const nextThousand = Math.floor(current / 1000 + 1) * 1000;
    const next = nextThousand;

    // Filtrage contextuel : on masque les anciens paliers de 500 pour ne garder que l'essentiel
    const lastPassed = passed[passed.length - 1]?.milestone;
    const relevant = ALL_MILESTONES.filter((m) => {
      if (SPECIAL_MILESTONES.includes(m as any)) return true;
      if (m === lastPassed) return true;
      if (m === next) return true;
      return false;
    });

    return {
      passedMilestones: passed,
      milestoneHitMap: hitMap,
      nextMilestone: next,
      relevantMilestones: relevant,
    };
  }, [progression, current]);

  // 2. Calcul de la cible (prochain millier de trophées + 150 tr.) et de la courbe de prédiction
  const {
    chartData,
    targetMilestone,
    predictionTarget,
    deltaTrophies,
    gainRate,
    matchesNeeded,
    hasPrediction,
    predictionReason,
    predictedNextMilestone,
  } = useMemo(() => {
    // La prochaine cible est le prochain millier (ex: 2000 si entre 1000 et 1999, 3000 si entre 2000 et 2999)
    const nextThousand = Math.floor(current / 1000 + 1) * 1000;
    // La prédiction va toujours 150 trophées au-delà de cette cible (ex: 3150 pour Doug)
    const predTarget = nextThousand + 150;
    const delta = Math.max(0, predTarget - current);

    const matchesWithChange = progression.filter((p) => p.matchIndex > 0 && p.change !== null);

    // Vérification explicite du volume d'historique : s'il n'y a pas assez de parties, ne rien afficher
    if (matchesWithChange.length < MIN_MATCHES_FOR_PREDICTION) {
      return {
        chartData: progression,
        targetMilestone: nextThousand,
        predictionTarget: predTarget,
        deltaTrophies: delta,
        gainRate: null,
        matchesNeeded: null,
        hasPrediction: false,
        predictionReason: `Historique insuffisant : au moins ${MIN_MATCHES_FOR_PREDICTION} combats enregistrés sont requis (${matchesWithChange.length} combat${matchesWithChange.length > 1 ? 's' : ''} actuellement).`,
        predictedNextMilestone: null,
      };
    }

    // Calcul du rythme de gain récent par partie sur les 20 dernières parties
    const recent = matchesWithChange.slice(-20);
    const recentGain = recent.reduce((sum, p) => sum + (p.change ?? 0), 0) / recent.length;

    let rate = 0;
    let isPositive = false;

    if (recentGain > 0) {
      rate = recentGain;
      isPositive = true;
    } else {
      const allGain = matchesWithChange.reduce((sum, p) => sum + (p.change ?? 0), 0) / matchesWithChange.length;
      if (allGain > 0) {
        rate = allGain;
        isPositive = true;
      }
    }

    // Si le rythme n'est pas positif (joueur en série de défaites ou neutre), on ne peut pas projeter
    if (!isPositive || rate <= 0) {
      return {
        chartData: progression,
        targetMilestone: nextThousand,
        predictionTarget: predTarget,
        deltaTrophies: delta,
        gainRate: recentGain,
        matchesNeeded: null,
        hasPrediction: false,
        predictionReason: `Rythme récent non positif (${fmtSigned(recentGain, 1)} tr. / partie) : projection vers le palier supérieur indisponible.`,
        predictedNextMilestone: null,
      };
    }

    // Historique suffisant et rythme positif validés
    const matchesCount = delta > 0 ? Math.max(5, Math.min(180, Math.round(delta / rate))) : 0;
    const lastPoint = progression[progression.length - 1];
    const lastIndex = lastPoint.matchIndex;
    const lastTime = Date.parse(lastPoint.time) || Date.now();

    // Estimation de la cadence temporelle
    let cadenceMs = (24 * 60 * 60 * 1000) / 4;
    if (progression.length >= 5) {
      const firstTime = Date.parse(progression[0].time);
      const span = lastTime - firstTime;
      if (span > 0 && progression.length > 1) {
        cadenceMs = span / (progression.length - 1);
      }
    }

    const steps = Math.min(matchesCount, 14);
    const predictedPoints: Array<BrawlerMatchPoint & { prediction: number; isPrediction: boolean }> = [];
    let predNext: { milestone: number; matchIndex: number; dateIso: string } | null = null;

    if (delta > 0 && matchesCount > 0) {
      for (let i = 1; i <= steps; i++) {
        const prog = i / steps;
        const mIdx = Math.round(lastIndex + prog * matchesCount);
        const predT = i === steps ? predTarget : Math.round(current + prog * delta);
        const estTime = new Date(lastTime + (mIdx - lastIndex) * cadenceMs).toISOString();

        predictedPoints.push({
          matchIndex: mIdx,
          time: estTime,
          trophies: null as unknown as number,
          prediction: predT,
          isPrediction: true,
          change: null,
        });

        if (nextThousand && predT >= nextThousand && !predNext) {
          predNext = { milestone: nextThousand, matchIndex: mIdx, dateIso: estTime };
        }
      }
    }

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
      targetMilestone: nextThousand,
      predictionTarget: predTarget,
      deltaTrophies: delta,
      gainRate: rate,
      matchesNeeded: matchesCount,
      hasPrediction: true,
      predictionReason: null,
      predictedNextMilestone: predNext,
    };
  }, [progression, current]);

  if (!progression || progression.length < 2) {
    return (
      <div style={{ height }} className="grid place-items-center rounded-2xl bg-fill px-6 text-center text-[13px] text-ink-2">
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
  const maxTrophies = Math.max(...allTrophies, predictionTarget);
  const yTicks = niceTicks(minTrophies, maxTrophies, 4);

  const maxMatchIndex = chartData[chartData.length - 1]?.matchIndex ?? progression.length;
  const xTicks = niceTicks(0, maxMatchIndex, 5);

  const displayedMilestones = showAllMilestones ? ALL_MILESTONES : relevantMilestones;

  return (
    <div className="space-y-3.5">
      {/* ── Bandeau supérieur 100% clair : Paliers clés & Prochain objectif ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-fill/60 px-3.5 py-2 text-[12px]">
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
                    'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12px] font-medium shadow-2xs',
                    meta.pillBg,
                    meta.pillBorder,
                    meta.pillText,
                  )}
                  title={`Atteint à la partie ${passed.matchIndex} (${fmtDateTime(passed.time)})`}
                >
                  <span className="text-[11px]">{meta.icon}</span>
                  <span className="font-semibold">{fmtInt(m)}</span>
                  <span className="text-[10px] opacity-75">P. {passed.matchIndex}</span>
                </span>
              );
            }

            if (isNext) {
              return (
                <span
                  key={m}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-pink-300 bg-pink-50/80 px-2.5 py-1 text-[12px] font-medium text-pink-700 shadow-2xs"
                  title={
                    predictedNextMilestone
                      ? `Prochain palier : estimé vers la partie ${predictedNextMilestone.matchIndex}`
                      : 'Prochain palier majeur'
                  }
                >
                  <span>{meta.icon}</span>
                  <span className="font-bold">{fmtInt(m)}</span>
                  {predictedNextMilestone && (
                    <span className="text-[10px] font-normal opacity-85">~P. {predictedNextMilestone.matchIndex}</span>
                  )}
                </span>
              );
            }

            return null;
          })}
        </div>

        {/* Bouton pour basculer l'affichage complet des 500 tr. */}
        <button
          type="button"
          onClick={() => setShowAllMilestones(!showAllMilestones)}
          className="text-[11px] font-medium text-ink-3 hover:text-accent hover:underline"
        >
          {showAllMilestones ? 'Vue synthétique' : 'Tous les 500 tr.'}
        </button>
      </div>

      {/* ── Légende claire & état de la prédiction ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full bg-blue-600" />
            <span className="font-medium text-ink">Combats réels ({progression.length - 1})</span>
          </div>
          {hasPrediction && deltaTrophies > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 rounded-full border-b-2 border-dashed border-amber-500" />
              <span className="font-medium text-amber-600">
                Prédiction (+{fmtInt(deltaTrophies)} tr. jusqu’à {fmtInt(predictionTarget)} tr.)
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

      {/* ── Message explicite si l'historique est insuffisant (aucune courbe affichée) ── */}
      {!hasPrediction && predictionReason && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2 text-[12px] text-amber-900">
          <Info className="size-4 shrink-0 text-amber-600" />
          <span>
            <strong>Prédiction non affichée :</strong> {predictionReason}
          </span>
        </div>
      )}

      {/* ── Graphique Recharts ── */}
      <div style={{ height }} role="img" aria-label="Progression des trophées par partie jouée">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
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
                  <div className="pointer-events-none min-w-[200px] max-w-[270px] rounded-xl bg-white/98 p-3 text-[12px] shadow-[0_6px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] backdrop-blur">
                    <div className="flex items-center justify-between border-b border-line pb-1.5">
                      <span className="font-semibold text-ink">
                        {isPred
                          ? `Partie estimée ${p.matchIndex}`
                          : p.matchIndex === 0
                            ? 'Point de départ'
                            : `Partie n° ${p.matchIndex}`}
                      </span>
                      {isPred ? (
                        <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
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
                      <div className="mt-1 flex items-center justify-between text-amber-700">
                        <span>Progression :</span>
                        <span className="font-bold tnum">+{fmtInt((p.prediction ?? 0) - current)} tr.</span>
                      </div>
                    )}

                    {!isPred && (p.mode || p.map) && (
                      <div className="mt-2 rounded-lg bg-fill px-2 py-1 text-[11px] text-ink-2">
                        {p.mode && <span className="font-medium text-ink">{modeLabel(p.mode)}</span>}
                        {p.map && <span> · {mapLabel(p.map) ?? p.map}</span>}
                      </div>
                    )}

                    {meta && (
                      <div
                        className={clsx(
                          'mt-2 flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold',
                          meta.pillBg,
                          meta.pillBorder,
                          meta.pillText,
                        )}
                      >
                        <span>{meta.icon}</span>
                        <span>Palier franchi : {meta.label}</span>
                      </div>
                    )}
                  </div>
                );
              }}
            />

            {/* ── Ligne de référence vers le prochain millier ciblé ── */}
            {targetMilestone && targetMilestone <= maxTrophies + 50 && (
              <ReferenceLine
                y={targetMilestone}
                stroke={getMilestoneMeta(targetMilestone).color}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: `Objectif ${getMilestoneMeta(targetMilestone).badge}`,
                  position: 'insideTopRight',
                  fill: getMilestoneMeta(targetMilestone).color,
                  fontSize: 11,
                  fontWeight: 600,
                  offset: 4,
                }}
              />
            )}

            {/* ── Courbe Réelle (Traits épurés) ── */}
            <Line
              dataKey="trophies"
              type="linear"
              stroke="#0071e3"
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
                if (meta.special) {
                  return (
                    <g key={`m-${payload.matchIndex}`} className="cursor-pointer">
                      <circle cx={cx} cy={cy} r={5} fill={meta.color} stroke="#ffffff" strokeWidth={2} />
                    </g>
                  );
                }

                return <circle key={`none-${payload.matchIndex}`} r={0} />;
              }}
              activeDot={{ r: 4.5, fill: '#0071e3', stroke: '#ffffff', strokeWidth: 2 }}
            />

            {/* ── Courbe de Prédiction (+150 tr. au-delà du prochain millier) ── */}
            {hasPrediction && deltaTrophies > 0 && (
              <Line
                dataKey="prediction"
                type="linear"
                stroke="#d97706"
                strokeWidth={2}
                strokeDasharray="4 4"
                strokeLinejoin="round"
                strokeLinecap="round"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4.5, fill: '#d97706', stroke: '#ffffff', strokeWidth: 2 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Résumé synthétique sous le graphique ── */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-fill p-2.5 border border-line">
          <div className="grid size-8 place-items-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <TrendingUp className="size-4" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-3">Rythme actuel</div>
            <div className="text-[13px] font-semibold text-ink tnum">
              {gainRate !== null ? (
                <>
                  +{gainRate.toFixed(1)} tr. <span className="text-[11px] font-normal text-ink-2">/ partie</span>
                </>
              ) : (
                <span className="text-[12px] font-normal text-ink-3">Données insuffisantes</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-xl bg-fill p-2.5 border border-line">
          <div className="grid size-8 place-items-center rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
            <Target className="size-4" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-3">Objectif (+150 tr.)</div>
            <div className="text-[13px] font-semibold text-ink tnum">
              {fmtInt(predictionTarget)} tr.{' '}
              <span className="text-[11px] font-normal text-ink-2">
                (palier {fmtInt(targetMilestone)} tr. + 150)
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-xl bg-fill p-2.5 border border-line">
          <div className="grid size-8 place-items-center rounded-lg bg-purple-50 text-purple-600 border border-purple-100">
            <Flame className="size-4" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-3">Parties estimées</div>
            <div className="text-[13px] font-semibold text-ink tnum">
              {!hasPrediction ? (
                <span className="text-[12px] font-normal text-ink-3">Indisponible</span>
              ) : (
                <>
                  ≈ {fmtInt(matchesNeeded)}{' '}
                  <span className="text-[11px] font-normal text-ink-2">jusqu’à {fmtInt(predictionTarget)} tr.</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
