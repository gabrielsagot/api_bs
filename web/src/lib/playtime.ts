// Axe du temps « de jeu » : les trophées et les points ne bougent que quand on joue.
// Chaque pause (plus de PAUSE_MS sans changement de la valeur tracée) est ramenée à
// un court intervalle, pour que la nuit, les jours sans partie ou le temps passé dans
// un autre mode (Ranked pour la courbe des trophées, par exemple) n'écrasent pas la courbe.

export const PAUSE_MS = 15 * 60_000;
/** Largeur maximale (en temps de jeu) d'une pause compressée. */
const PAUSE_WIDTH_MS = 4 * 60_000;
/** Part maximale de l'axe occupée par l'ensemble des pauses. */
const PAUSES_SHARE = 0.12;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const STEPS = [5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY];

export interface Pause {
  /** Début et fin de la pause sur l'axe compressé. */
  x1: number;
  x2: number;
  /** Heure réelle de reprise. */
  resume: number;
}

export interface PlayTimeline {
  /** Position sur l'axe compressé d'une heure réelle (interpolée entre deux mesures). */
  toX(t: number): number;
  /** Heure réelle correspondant à une position de l'axe compressé. */
  toTime(x: number): number;
  maxX: number;
  pauses: Pause[];
  /** Graduations (positions compressées) : reprises de jeu, plus des heures rondes dans les longues sessions. */
  ticks: number[];
  /** Libellé d'une graduation. */
  label(x: number): string;
}

export function playTimeline(times: readonly number[], maxTicks = 6): PlayTimeline {
  const sorted = [...new Set(times)].sort((a, b) => a - b);
  const xs: number[] = [];
  const pauses: Pause[] = [];
  // Largeur d'une pause : 4 min au plus, et toutes ensemble pas plus de 12 % de l'axe.
  let played = 0;
  let pauseCount = 0;
  sorted.forEach((t, i) => {
    if (i === 0) return;
    const dt = t - sorted[i - 1];
    if (dt > PAUSE_MS) pauseCount++;
    else played += dt;
  });
  const pauseWidth = pauseCount
    ? Math.min(PAUSE_WIDTH_MS, played > 0 ? (played * PAUSES_SHARE) / (1 - PAUSES_SHARE) / pauseCount : PAUSE_WIDTH_MS)
    : 0;
  sorted.forEach((t, i) => {
    if (i === 0) return void xs.push(0);
    const dt = t - sorted[i - 1];
    const x = xs[i - 1] + (dt > PAUSE_MS ? pauseWidth : dt);
    if (dt > PAUSE_MS) pauses.push({ x1: xs[i - 1], x2: x, resume: t });
    xs.push(x);
  });
  const maxX = xs.at(-1) ?? 0;

  const toX = (t: number): number => {
    if (!sorted.length) return 0;
    if (t <= sorted[0]) return 0;
    if (t >= sorted[sorted.length - 1]) return maxX;
    let i = 1;
    while (sorted[i] < t) i++;
    const ratio = (t - sorted[i - 1]) / (sorted[i] - sorted[i - 1]);
    return xs[i - 1] + ratio * (xs[i] - xs[i - 1]);
  };
  const toTime = (x: number): number => {
    if (!sorted.length) return 0;
    if (x <= 0) return sorted[0];
    if (x >= maxX) return sorted[sorted.length - 1];
    let i = 1;
    while (xs[i] < x) i++;
    const ratio = xs[i] === xs[i - 1] ? 0 : (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
    return sorted[i - 1] + ratio * (sorted[i] - sorted[i - 1]);
  };

  // Graduations : chaque reprise de jeu est prioritaire, puis des heures rondes
  // à l'intérieur des sessions longues ; on les espace d'au moins maxX / maxTicks.
  const spacing = maxX / maxTicks;
  const step = STEPS.find((s) => maxX / s <= maxTicks) ?? DAY;
  const candidates: { x: number; priority: number }[] = [{ x: 0, priority: 0 }];
  for (const pause of pauses) candidates.push({ x: pause.x2, priority: 0 });
  const sessions = [0, ...pauses.map((p) => p.x2)].map((start, i) => [start, pauses[i]?.x1 ?? maxX]);
  for (const [start, end] of sessions) {
    const t0 = toTime(start);
    for (let t = Math.ceil(t0 / step) * step; t < toTime(end); t += step) candidates.push({ x: toX(t), priority: 1 });
  }
  candidates.sort((a, b) => a.priority - b.priority || a.x - b.x);
  const ticks: number[] = [];
  for (const candidate of candidates) {
    if (ticks.every((x) => Math.abs(x - candidate.x) >= spacing * 0.8)) ticks.push(candidate.x);
  }
  ticks.sort((a, b) => a - b);
  // Pas de graduation collée au bord droit : son libellé serait coupé.
  while (ticks.length > 1 && ticks[ticks.length - 1] > maxX * 0.95) ticks.pop();

  const realSpan = (sorted.at(-1) ?? 0) - (sorted[0] ?? 0);
  const label = (x: number): string => {
    const date = new Date(toTime(x));
    const index = ticks.indexOf(x);
    const previous = index > 0 ? new Date(toTime(ticks[index - 1])) : null;
    const newDay = !previous || previous.toDateString() !== date.toDateString();
    const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (realSpan > 36 * HOUR && newDay) return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    // Sur un jour ou deux, un changement de jour est signalé par le jour de la semaine.
    if (previous && newDay) return `${date.toLocaleDateString('fr-FR', { weekday: 'short' })} ${time}`;
    return time;
  };

  return { toX, toTime, maxX, pauses, ticks, label };
}

/**
 * Retire le point final ajouté pour prolonger la courbe jusqu'à maintenant quand la
 * valeur n'a pas bougé depuis : il ne correspond à aucune partie (la valeur actuelle
 * reste affichée dans les chiffres clés). On garde toujours au moins deux points.
 */
export function trimIdleTail<T extends { t: number; v: number }>(points: T[]): T[] {
  const last = points.at(-1);
  const previous = points.at(-2);
  if (points.length > 2 && last && previous && last.v === previous.v) return points.slice(0, -1);
  return points;
}

/**
 * Ne garde que les mesures qui encadrent un changement de valeur : un palier plat
 * (trophées inchangés pendant qu'on joue en Ranked, par exemple) se réduit à ses deux
 * extrémités, et l'écart entre elles devient une pause s'il dépasse PAUSE_MS.
 */
export function keepChanges<T extends { t: number; v: number }>(points: T[]): T[] {
  return points.filter(
    (point, i) =>
      i === 0 || i === points.length - 1 || point.v !== points[i - 1].v || point.v !== points[i + 1].v,
  );
}

/** Points prêts pour l'axe en temps de jeu : paliers réduits, prolongation finale inutile retirée. */
export function playPoints<T extends { t: number; v: number }>(points: T[]): T[] {
  return trimIdleTail(keepChanges(points));
}
