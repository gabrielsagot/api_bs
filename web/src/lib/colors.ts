// Couleurs des graphiques. Palette catégorielle validée (ordre fixe, jamais cyclé)
// sur fond blanc : écarts daltonisme OK. La couleur suit l'entité (un joueur garde
// toujours son créneau), jamais son rang.

export const SERIES = ['#0071e3', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

export const seriesColor = (slot: number) => SERIES[((slot % SERIES.length) + SERIES.length) % SERIES.length];

export const CHART = {
  accent: '#0071e3',
  good: '#0ca30c',
  bad: '#d03b3b',
  grid: '#ececf0',
  axis: '#d2d2d7',
  tick: '#86868b',
  surface: '#ffffff',
  muted: '#c7c7cc',
};
