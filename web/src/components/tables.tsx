import clsx from 'clsx';
import { ArrowDown, ArrowUp, Star } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { modeLabel } from '../../../shared/labels';
import type { BreakdownRow } from '../../../shared/types';
import { fmtInt, fmtPct, fmtSigned } from '../lib/format';
import { BrawlerAvatar } from './avatars';
import { Meter } from './ui';

export interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
  sort?: (row: T) => number | string | null;
  /** Masquée sur petit écran pour éviter le défilement horizontal. */
  wide?: boolean;
  className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  limit = 8,
  empty = 'Aucune donnée sur la période.',
  onRowClick,
}: {
  rows: readonly T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; desc?: boolean };
  limit?: number;
  empty?: string;
  onRowClick?: (row: T) => void;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    const column = sort && columns.find((c) => c.key === sort.key);
    if (!column?.sort) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = column.sort!(a);
      const vb = column.sort!(b);
      if (va === vb) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const order = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb, 'fr') : va < vb ? -1 : 1;
      return sort!.desc ? -order : order;
    });
    return copy;
  }, [rows, columns, sort]);

  if (!rows.length) return <p className="py-6 text-center text-[13px] text-ink-2">{empty}</p>;
  const visible = expanded ? sorted : sorted.slice(0, limit);

  return (
    <div>
      <div className="-mx-2 overflow-x-auto">
        <table className="w-full min-w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (sort!.desc ? 'descending' : 'ascending') : undefined}
                    className={clsx(
                      'whitespace-nowrap px-2 pb-2 text-[12px] font-medium text-ink-3',
                      column.align === 'right' ? 'text-right' : 'text-left',
                      column.wide && 'hidden sm:table-cell',
                    )}
                  >
                    {column.sort ? (
                      <button
                        type="button"
                        className={clsx('inline-flex items-center gap-0.5 hover:text-ink', active && 'text-ink')}
                        onClick={() =>
                          setSort(active ? { key: column.key, desc: !sort!.desc } : { key: column.key, desc: true })
                        }
                      >
                        {column.header}
                        {active && (sort!.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(onRowClick && 'cursor-pointer hover:bg-fill/70')}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={clsx(
                      'border-t border-line px-2 py-2 align-middle',
                      column.align === 'right' ? 'text-right tnum' : 'text-left',
                      column.wide && 'hidden sm:table-cell',
                      column.className,
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[13px] font-medium text-accent hover:underline"
        >
          {expanded ? 'Réduire' : `Voir les ${rows.length} lignes`}
        </button>
      )}
    </div>
  );
}

export type BreakdownKind = 'brawler' | 'map' | 'mode' | 'ally' | 'category' | 'opponent';

const CATEGORY_LABELS: Record<string, string> = {
  ranked: 'Ranked',
  trophies: 'Trophées',
  friendly: 'Amical',
  other: 'Autres',
};

function BreakdownLabel({ row, kind, playerSlug }: { row: BreakdownRow; kind: BreakdownKind; playerSlug?: string }) {
  if (kind === 'brawler' || kind === 'opponent') {
    const content = (
      <span className="flex min-w-0 items-center gap-2.5">
        <BrawlerAvatar id={row.id} name={row.label} size={28} />
        <span className="truncate font-medium">{row.label}</span>
      </span>
    );
    return kind === 'brawler' && playerSlug && row.id ? (
      <Link to={`/p/${playerSlug}/brawlers/${row.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
        {content}
      </Link>
    ) : (
      content
    );
  }
  if (kind === 'map') {
    return (
      <span className="block min-w-0">
        <span className="block truncate font-medium">{row.label}</span>
        <span className="block truncate text-[12px] text-ink-2">{modeLabel(row.sub)}</span>
      </span>
    );
  }
  if (kind === 'ally') {
    return (
      <span className="block min-w-0">
        <span className="block truncate font-medium">{row.label}</span>
        <span className="block truncate text-[12px] text-ink-3">{row.sub}</span>
      </span>
    );
  }
  if (kind === 'mode') return <span className="font-medium">{modeLabel(row.label)}</span>;
  return <span className="font-medium">{CATEGORY_LABELS[row.label] ?? row.label}</span>;
}

/** Tableau standard « par brawler / map / mode… » : parties, V–D, winrate. */
export function BreakdownTable({
  rows,
  kind,
  limit = 8,
  showStar = false,
  showTrophies = false,
  playerSlug,
  firstHeader,
  empty,
  initialSort = 'games',
}: {
  rows: BreakdownRow[];
  kind: BreakdownKind;
  limit?: number;
  showStar?: boolean;
  showTrophies?: boolean;
  playerSlug?: string;
  firstHeader?: string;
  empty?: string;
  initialSort?: 'games' | 'winRate';
}) {
  const headers: Record<BreakdownKind, string> = {
    brawler: 'Brawler',
    opponent: 'Brawler adverse',
    map: 'Map',
    mode: 'Mode',
    ally: 'Coéquipier',
    category: 'Type',
  };
  const columns: Column<BreakdownRow>[] = [
    {
      key: 'label',
      header: firstHeader ?? headers[kind],
      render: (row) => <BreakdownLabel row={row} kind={kind} playerSlug={playerSlug} />,
      sort: (row) => row.label,
      className: 'max-w-[220px]',
    },
    { key: 'games', header: 'Parties', align: 'right', render: (row) => fmtInt(row.games), sort: (row) => row.games },
    {
      key: 'wl',
      header: 'V – D',
      align: 'right',
      wide: true,
      render: (row) => (
        <span className="text-ink-2">
          {row.wins} – {row.losses}
          {row.draws ? ` – ${row.draws}` : ''}
        </span>
      ),
    },
    {
      key: 'winRate',
      header: 'Winrate',
      render: (row) => <Meter value={row.winRate} className="min-w-[120px]" />,
      sort: (row) => row.winRate,
    },
  ];
  if (showStar) {
    columns.push({
      key: 'star',
      header: 'Star player',
      align: 'right',
      wide: true,
      render: (row) =>
        row.starPlayers ? (
          <span className="inline-flex items-center gap-1 text-ink-2">
            <Star className="size-3 fill-current" aria-hidden />
            {fmtPct(row.starPlayers / row.games)}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
      sort: (row) => row.starPlayers / Math.max(1, row.games),
    });
  }
  if (showTrophies) {
    columns.push({
      key: 'trophies',
      header: 'Trophées',
      align: 'right',
      render: (row) => (
        <span className={clsx(row.trophyNet && row.trophyNet > 0 ? 'text-good' : row.trophyNet && row.trophyNet < 0 ? 'text-bad' : 'text-ink-3')}>
          {row.trophyNet === null ? '—' : fmtSigned(row.trophyNet)}
        </span>
      ),
      sort: (row) => row.trophyNet,
    });
  }
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.key}
      limit={limit}
      empty={empty}
      initialSort={{ key: initialSort, desc: true }}
    />
  );
}
