import clsx from 'clsx';
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import type { Period } from '../../../shared/types';
// Stub pour le composant en cours de développement
const usePlayerHistoryDays = (_slug: string): { data?: { days: string[]; maxDate?: string; battlesCount?: Record<string, number> }; isLoading: boolean } => ({
  data: undefined,
  isLoading: false,
});
import { fmtDateTime } from '../lib/format';

interface TimeFilterOption {
  value: Period;
  label: string;
}

interface TimeFilterProps {
  slug: string;
  period: Period;
  since: string | null;
  until: string | null;
  options: readonly TimeFilterOption[];
  onSelectPreset: (preset: Period) => void;
  onApplyCustom: (since: string, until: string) => void;
  onReset: () => void;
  label?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const MONTH_NAMES = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseIsoToLocalDateTime(iso: string | null | undefined): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

function localDateTimeToIso(dateStr: string, timeStr: string, isEnd = false): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  const dt = new Date(y, m - 1, d, h, min, isEnd ? 59 : 0, isEnd ? 999 : 0);
  return dt.toISOString();
}

export function formatCompactRange(since: string | null, until: string | null): string {
  if (!since || !until) return 'Choisir';
  const start = new Date(since);
  const end = new Date(until);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Choisir';

  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  const startDay = start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const startTime = start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const endTime = end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if (sameDay) {
    if (startTime === '00:00' && (endTime === '23:59' || endTime === '00:00')) {
      return startDay;
    }
    return `${startDay} (${startTime}–${endTime})`;
  }

  const endDay = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `${startDay} → ${endDay}`;
}

export function TimeFilter({
  slug,
  period,
  since,
  until,
  options,
  onSelectPreset,
  onApplyCustom,
  onReset,
  label = 'Période',
  isOpen,
  onOpenChange,
}: TimeFilterProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isDialogOpen = isOpen !== undefined ? isOpen : internalOpen;
  const setDialogOpen = onOpenChange ?? setInternalOpen;
  const isCustomActive = (period as string) === 'custom';
  const buttonLabel = isCustomActive ? formatCompactRange(since, until) : 'Choisir';

  return (
    <>
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex max-w-full items-center overflow-x-auto rounded-[10px] bg-[#e9e9ee] p-[2px] no-scrollbar"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === period && !isCustomActive}
            onClick={() => onSelectPreset(option.value)}
            className={clsx(
              'whitespace-nowrap rounded-[8px] px-3 py-[5px] text-[13px] font-medium transition-colors',
              option.value === period && !isCustomActive
                ? 'bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                : 'text-ink-2 hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}

        <div className="relative inline-flex items-center">
          <button
            type="button"
            role="radio"
            aria-checked={isCustomActive}
            onClick={() => setDialogOpen(true)}
            title="Choisir une date ou plage personnalisée avec horaires"
            className={clsx(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3 py-[5px] text-[13px] font-medium transition-colors',
              isCustomActive
                ? 'bg-accent text-white shadow-[0_1px_3px_rgba(0,113,227,0.3)]'
                : 'text-ink-2 hover:text-ink',
            )}
          >
            <CalendarRange className="size-3.5" />
            <span>{buttonLabel}</span>
          </button>

          {isCustomActive && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              title="Réinitialiser la période personnalisée"
              className="ml-0.5 grid size-5 place-items-center rounded-full text-white/80 hover:bg-white/20 hover:text-white"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {isDialogOpen && (
        <CustomTimeDialog
          slug={slug}
          initialSince={since}
          initialUntil={until}
          onClose={() => setDialogOpen(false)}
          onApply={(newSince, newUntil) => {
            onApplyCustom(newSince, newUntil);
            setDialogOpen(false);
          }}
          onReset={() => {
            onReset();
            setDialogOpen(false);
          }}
        />
      )}
    </>
  );
}

/** Bannière d'information affichée au-dessus des graphiques lorsque le filtre personnalisé est actif */
export function CustomTimeBanner({
  since,
  until,
  onEdit,
  onReset,
}: {
  since: string | null;
  until: string | null;
  onEdit: () => void;
  onReset: () => void;
}) {
  if (!since || !until) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-accent/20 bg-accent-soft/70 px-4 py-2.5 text-[13px] text-ink">
      <div className="flex min-w-0 items-center gap-2">
        <CalendarDays className="size-4 shrink-0 text-accent" />
        <span className="truncate">
          <strong className="font-semibold text-accent">Période personnalisée :</strong> du{' '}
          <span className="font-medium">{fmtDateTime(since)}</span> au{' '}
          <span className="font-medium">{fmtDateTime(until)}</span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="font-medium text-accent hover:underline"
        >
          Modifier la plage
        </button>
        <span className="text-ink-3">·</span>
        <button
          type="button"
          onClick={onReset}
          className="font-medium text-ink-2 hover:text-bad"
        >
          Effacer
        </button>
      </div>
    </div>
  );
}

interface CustomTimeDialogProps {
  slug: string;
  initialSince: string | null;
  initialUntil: string | null;
  onClose: () => void;
  onApply: (since: string, until: string) => void;
  onReset: () => void;
}

function CustomTimeDialog({
  slug,
  initialSince,
  initialUntil,
  onClose,
  onApply,
  onReset,
}: CustomTimeDialogProps) {
  const dialogTitleId = useId();
  const { data: history, isLoading } = usePlayerHistoryDays(slug);

  const historyDaysSet = useMemo(() => new Set(history?.days ?? []), [history?.days]);

  // Initial date & time resolution
  const parsedStart = parseIsoToLocalDateTime(initialSince);
  const parsedEnd = parseIsoToLocalDateTime(initialUntil);

  const defaultDate = history?.maxDate ?? new Date().toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState<string>(() => parsedStart?.date ?? defaultDate);
  const [endDate, setEndDate] = useState<string>(() => parsedEnd?.date ?? defaultDate);
  const [startTime, setStartTime] = useState<string>(() => parsedStart?.time ?? '00:00');
  const [endTime, setEndTime] = useState<string>(() => parsedEnd?.time ?? '23:59');
  const [selectionStep, setSelectionStep] = useState<'start' | 'end'>('start');

  // Month navigation: view year and month
  const [viewDate, setViewDate] = useState<Date>(() => {
    const target = parsedEnd?.date ?? parsedStart?.date ?? defaultDate;
    const [y, m] = target.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  // Calendar matrix calculation
  const calendarDays = useMemo(() => {
    // 0 = Lun, 6 = Dim
    const firstDayWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    const days: { dayNumber: number; dateStr: string; isCurrentMonth: boolean }[] = [];

    // Days from previous month for offset
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayWeekday - 1; i >= 0; i--) {
      const prevDate = new Date(year, month - 1, prevMonthDays - i);
      days.push({
        dayNumber: prevMonthDays - i,
        dateStr: `${prevDate.getFullYear()}-${pad2(prevDate.getMonth() + 1)}-${pad2(prevDate.getDate())}`,
        isCurrentMonth: false,
      });
    }

    // Days in current month
    for (let d = 1; d <= totalDaysInMonth; d++) {
      days.push({
        dayNumber: d,
        dateStr: `${year}-${pad2(month + 1)}-${pad2(d)}`,
        isCurrentMonth: true,
      });
    }

    // Trailing days from next month to complete the row
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d);
      days.push({
        dayNumber: d,
        dateStr: `${nextDate.getFullYear()}-${pad2(nextDate.getMonth() + 1)}-${pad2(nextDate.getDate())}`,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [year, month]);

  const handleDayClick = (dateStr: string) => {
    if (!historyDaysSet.has(dateStr)) return; // Ignorer les jours sans historique

    if (selectionStep === 'start') {
      setStartDate(dateStr);
      setEndDate(dateStr);
      setSelectionStep('end');
    } else {
      if (dateStr < startDate) {
        setStartDate(dateStr);
        setEndDate(startDate);
      } else {
        setEndDate(dateStr);
      }
      setSelectionStep('start');
    }
  };

  // Quick preset shortcuts
  const selectSingleDay = (dateStr: string) => {
    setStartDate(dateStr);
    setEndDate(dateStr);
    setStartTime('00:00');
    setEndTime('23:59');
    setSelectionStep('start');
    const [y, m] = dateStr.split('-').map(Number);
    setViewDate(new Date(y, m - 1, 1));
  };

  const handleLastActiveDay = () => {
    if (history?.maxDate) selectSingleDay(history.maxDate);
  };

  const handleLast7ActiveDays = () => {
    if (!history?.days.length) return;
    const end = history.maxDate ?? new Date().toISOString().slice(0, 10);
    const endDateObj = new Date(end);
    const startDateObj = new Date(endDateObj.getTime() - 6 * 24 * 3600 * 1000);
    const startStr = `${startDateObj.getFullYear()}-${pad2(startDateObj.getMonth() + 1)}-${pad2(startDateObj.getDate())}`;
    setStartDate(startStr);
    setEndDate(end);
    setStartTime('00:00');
    setEndTime('23:59');
    setSelectionStep('start');
    setViewDate(new Date(endDateObj.getFullYear(), endDateObj.getMonth(), 1));
  };

  const handleThisMonth = () => {
    const now = new Date();
    const startStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const endStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(lastDay)}`;
    setStartDate(startStr);
    setEndDate(endStr);
    setStartTime('00:00');
    setEndTime('23:59');
    setSelectionStep('start');
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  // Estimate battle counts for the selected range
  const estimatedBattlesCount = useMemo(() => {
    if (!history?.battlesCount) return 0;
    let count = 0;
    for (const [day, n] of Object.entries(history.battlesCount)) {
      if (day >= startDate && day <= endDate) {
        count += Number(n);
      }
    }
    return count;
  }, [history?.battlesCount, startDate, endDate]);

  const handleApply = () => {
    const finalStart = startDate <= endDate ? startDate : endDate;
    const finalEnd = startDate <= endDate ? endDate : startDate;
    const sinceIso = localDateTimeToIso(finalStart, startTime, false);
    const untilIso = localDateTimeToIso(finalEnd, endTime, true);
    onApply(sinceIso, untilIso);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialogTitleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[620px] max-h-[92vh] flex flex-col rounded-[22px] bg-surface shadow-2xl border border-line overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-accent-soft text-accent">
              <CalendarRange className="size-4" />
            </span>
            <div>
              <h2 id={dialogTitleId} className="text-[17px] font-semibold tracking-tight text-ink">
                Choisir une plage horaire
              </h2>
              <p className="text-[12px] text-ink-3">
                Sélectionne un ou plusieurs jours précis et affine les heures.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-full text-ink-3 hover:bg-fill hover:text-ink transition"
            aria-label="Fermer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Corps avec défilement */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Raccourcis rapides */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3 mr-1">Raccourcis :</span>
            <button
              type="button"
              onClick={handleLastActiveDay}
              className="inline-flex items-center gap-1 rounded-full bg-fill hover:bg-line px-2.5 py-1 text-[12px] font-medium text-ink transition"
            >
              <Sparkles className="size-3 text-accent" />
              Dernier jour joué
            </button>
            <button
              type="button"
              onClick={handleLast7ActiveDays}
              className="rounded-full bg-fill hover:bg-line px-2.5 py-1 text-[12px] font-medium text-ink transition"
            >
              7 derniers jours
            </button>
            <button
              type="button"
              onClick={handleThisMonth}
              className="rounded-full bg-fill hover:bg-line px-2.5 py-1 text-[12px] font-medium text-ink transition"
            >
              Ce mois-ci
            </button>
          </div>

          {/* Calendrier interactif */}
          <div className="rounded-[16px] border border-line bg-canvas/60 p-4">
            {/* Barre de navigation du mois */}
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-ink">
                {MONTH_NAMES[month]} {year}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="grid size-7 place-items-center rounded-lg bg-surface border border-line text-ink-2 hover:text-ink hover:bg-fill transition"
                  aria-label="Mois précédent"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="grid size-7 place-items-center rounded-lg bg-surface border border-line text-ink-2 hover:text-ink hover:bg-fill transition"
                  aria-label="Mois suivant"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>

            {/* En-têtes de colonnes (jours de la semaine) */}
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-ink-3 mb-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>

            {/* Grille des jours */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map(({ dayNumber, dateStr, isCurrentMonth }) => {
                const hasHistory = historyDaysSet.has(dateStr);
                const isStart = dateStr === startDate;
                const isEnd = dateStr === endDate;
                const inRange = dateStr >= startDate && dateStr <= endDate;
                const battlesCount = history?.battlesCount?.[dateStr] ?? 0;

                if (!isCurrentMonth) {
                  return (
                    <div
                      key={dateStr}
                      className="h-10 grid place-items-center text-[12px] text-ink-3/20 select-none"
                    >
                      {dayNumber}
                    </div>
                  );
                }

                if (!hasHistory) {
                  return (
                    <div
                      key={dateStr}
                      title="Aucune donnée enregistrée ce jour"
                      className="group relative h-10 grid place-items-center rounded-lg text-[13px] text-ink-3/30 select-none cursor-not-allowed bg-transparent"
                    >
                      <span>{dayNumber}</span>
                    </div>
                  );
                }

                // Jour avec historique
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => handleDayClick(dateStr)}
                    title={`${dayNumber} ${MONTH_NAMES[month]} : ${battlesCount} combat${battlesCount > 1 ? 's' : ''}`}
                    className={clsx(
                      'relative h-10 w-full flex flex-col items-center justify-center rounded-lg text-[13px] font-medium transition-colors',
                      isStart || isEnd
                        ? 'bg-accent text-white font-semibold shadow-xs'
                        : inRange
                          ? 'bg-accent-soft text-accent'
                          : 'bg-surface hover:bg-fill text-ink border border-line/60',
                    )}
                  >
                    <span>{dayNumber}</span>
                    {/* Indicateur de combats */}
                    <span
                      className={clsx(
                        'size-1 rounded-full mt-0.5',
                        isStart || isEnd
                          ? 'bg-white'
                          : inRange
                            ? 'bg-accent'
                            : battlesCount >= 5
                              ? 'bg-good'
                              : 'bg-accent/80',
                      )}
                    />
                  </button>
                );
              })}
            </div>

            {/* Légende du calendrier */}
            <div className="mt-3 flex flex-wrap items-center justify-between border-t border-line/80 pt-2.5 text-[11px] text-ink-3">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-accent" />
                  Jour avec historique
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full border border-ink-3/40" />
                  Grisé = sans historique
                </span>
              </div>
              <div>
                {selectionStep === 'end' ? (
                  <span className="text-accent font-medium">Clique sur la date de fin</span>
                ) : (
                  <span>Clique pour choisir une date</span>
                )}
              </div>
            </div>
          </div>

          {/* Section Plage horaire */}
          <div className="rounded-[16px] border border-line bg-surface p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-accent" />
              <h3 className="text-[14px] font-semibold text-ink">Plage horaire</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block rounded-xl border border-line bg-fill/50 p-2.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3 block mb-1">
                  Heure de début
                </span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-surface border border-line rounded-lg px-2.5 py-1.5 text-[14px] font-mono text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="block rounded-xl border border-line bg-fill/50 p-2.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3 block mb-1">
                  Heure de fin
                </span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-surface border border-line rounded-lg px-2.5 py-1.5 text-[14px] font-mono text-ink outline-none focus:border-accent"
                />
              </label>
            </div>

            {/* Boutons d'heures prédéfinies */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-ink-3 mr-1">Plages courantes :</span>
              <button
                type="button"
                onClick={() => {
                  setStartTime('00:00');
                  setEndTime('23:59');
                }}
                className="rounded-full border border-line bg-surface hover:bg-fill px-2 py-0.5 text-[11px] font-medium text-ink transition"
              >
                Journée complète (00:00–23:59)
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartTime('08:00');
                  setEndTime('12:00');
                }}
                className="rounded-full border border-line bg-surface hover:bg-fill px-2 py-0.5 text-[11px] font-medium text-ink transition"
              >
                Matin (08:00–12:00)
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartTime('12:00');
                  setEndTime('18:00');
                }}
                className="rounded-full border border-line bg-surface hover:bg-fill px-2 py-0.5 text-[11px] font-medium text-ink transition"
              >
                Après-midi (12:00–18:00)
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartTime('18:00');
                  setEndTime('23:59');
                }}
                className="rounded-full border border-line bg-surface hover:bg-fill px-2 py-0.5 text-[11px] font-medium text-ink transition"
              >
                Soirée (18:00–23:59)
              </button>
            </div>
          </div>

          {/* Récapitulatif sélectionné */}
          <div className="rounded-[14px] bg-accent-soft/60 border border-accent/20 p-3.5 flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <div>
              <span className="text-ink-3 block text-[11px]">Plage sélectionnée :</span>
              <span className="font-semibold text-ink">
                Du {startDate} à {startTime} au {endDate} à {endTime}
              </span>
            </div>
            {estimatedBattlesCount > 0 ? (
              <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[12px] font-medium text-accent">
                ~{estimatedBattlesCount} combat{estimatedBattlesCount > 1 ? 's' : ''} enregistré{estimatedBattlesCount > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-[12px] text-ink-3">
                {isLoading ? 'Chargement de l’historique…' : 'Aucun combat connu sur ce créneau'}
              </span>
            )}
          </div>
        </div>

        {/* Pied de page et actions */}
        <div className="flex items-center justify-between border-t border-line bg-canvas/30 px-5 py-3">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-fill hover:text-ink transition"
          >
            <RotateCcw className="size-3.5" />
            Réinitialiser
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[10px] border border-line bg-surface px-4 py-1.5 text-[13px] font-medium text-ink hover:bg-fill transition"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="rounded-[10px] bg-accent px-4 py-1.5 text-[13px] font-semibold text-white shadow-xs hover:bg-accent-hover transition"
            >
              Appliquer la sélection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
