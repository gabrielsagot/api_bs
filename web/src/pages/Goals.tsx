import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { MAX_RANKED_TIER, tierName } from '../../../shared/labels';
import type { GoalDto, GoalKind } from '../../../shared/types';
import { GoalProgress } from '../components/cards';
import { Button, Card, CardHeader, EmptyState, ErrorState, LoadingState, PageHeader, Select } from '../components/ui';
import { useCollection, useCreateGoal, useDeleteGoal, useGoals, useOverview } from '../lib/api';
import { fmtInt } from '../lib/format';
import { usePlayerSlug } from '../lib/hooks';

const KINDS: { value: GoalKind; label: string }[] = [
  { value: 'trophies', label: 'Trophées totaux' },
  { value: 'ranked_tier', label: 'Rang Ranked' },
  { value: 'ranked_elo', label: 'Points Ranked' },
  { value: 'brawler_trophies', label: 'Trophées d’un brawler' },
  { value: 'power11', label: 'Brawlers niveau 11' },
  { value: 'brawlers_owned', label: 'Brawlers débloqués' },
  { value: 'victories_3v3', label: 'Victoires 3v3' },
];

function GoalItem({ goal }: { goal: GoalDto }) {
  const remove = useDeleteGoal();
  return (
    <li className="flex items-start gap-3 border-t border-line py-4 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <GoalProgress goal={goal} />
      </div>
      <button
        type="button"
        onClick={() => remove.mutate(goal.id)}
        aria-label={`Supprimer l’objectif « ${goal.label} »`}
        title="Supprimer"
        className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-bad-soft hover:text-bad"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

export function GoalsPage() {
  const slug = usePlayerSlug();
  const goals = useGoals(slug);
  const collection = useCollection(slug);
  const overview = useOverview(slug);
  const create = useCreateGoal(slug);
  const [kind, setKind] = useState<GoalKind>('trophies');
  const [brawlerId, setBrawlerId] = useState('');
  const [target, setTarget] = useState('');

  if (goals.isLoading) return <LoadingState />;
  if (goals.error || !goals.data) return <ErrorState error={goals.error} />;

  const owned = (collection.data?.brawlers ?? []).filter((b) => b.owned).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const selectedBrawler = owned.find((b) => String(b.id) === brawlerId);
  const currentTier = overview.data?.ranked.currentTier ?? null;
  const suggestion = (() => {
    switch (kind) {
      case 'trophies':
        return overview.data?.trophies.current ? Math.ceil((overview.data.trophies.current + 1000) / 500) * 500 : null;
      case 'brawler_trophies':
        return selectedBrawler?.trophies != null ? Math.ceil((selectedBrawler.trophies + 100) / 50) * 50 : null;
      case 'ranked_elo':
        return overview.data?.ranked.profile.elo != null ? Math.ceil((overview.data.ranked.profile.elo + 300) / 100) * 100 : null;
      case 'power11':
        return (collection.data?.totals.power11 ?? 0) + 5;
      case 'brawlers_owned':
        return collection.data?.totals.total ?? null;
      default:
        return null;
    }
  })();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(target || (kind === 'ranked_tier' ? Math.min(MAX_RANKED_TIER, (currentTier ?? 0) + 2) : suggestion));
    create.mutate(
      { kind, target: value, brawlerId: kind === 'brawler_trophies' ? Number(brawlerId) : null },
      { onSuccess: () => setTarget('') },
    );
  };

  const open = goals.data.filter((g) => !g.achievedAt);
  const done = goals.data.filter((g) => g.achievedAt);

  return (
    <>
      <PageHeader title="Objectifs" subtitle="Fixe un cap : le dashboard suit ta progression et estime quand tu l’atteindras." />
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader title="Nouvel objectif" />
          <form onSubmit={submit} className="space-y-4">
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-2">Type</div>
              <Select
                label="Type d’objectif"
                value={kind}
                onChange={(value) => {
                  setKind(value as GoalKind);
                  setTarget('');
                }}
                options={KINDS}
                className="w-full [&>select]:w-full [&>select]:max-w-none"
              />
            </div>
            {kind === 'brawler_trophies' && (
              <div>
                <div className="mb-1.5 text-[13px] font-medium text-ink-2">Brawler</div>
                <Select
                  label="Brawler"
                  value={brawlerId}
                  onChange={setBrawlerId}
                  options={[{ value: '', label: 'Choisir…' }, ...owned.map((b) => ({ value: String(b.id), label: `${b.name} (${fmtInt(b.trophies)})` }))]}
                  className="w-full [&>select]:w-full [&>select]:max-w-none"
                />
              </div>
            )}
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-2">Cible</div>
              {kind === 'ranked_tier' ? (
                <Select
                  label="Rang visé"
                  value={target}
                  onChange={setTarget}
                  options={[
                    { value: '', label: 'Choisir un rang…' },
                    ...Array.from({ length: MAX_RANKED_TIER }, (_, i) => i + 1)
                      .filter((tier) => currentTier === null || tier > currentTier)
                      .map((tier) => ({ value: String(tier), label: tierName(tier) })),
                  ]}
                  className="w-full [&>select]:w-full [&>select]:max-w-none"
                />
              ) : (
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder={suggestion ? `ex. ${fmtInt(suggestion)}` : 'Valeur à atteindre'}
                  className="h-[34px] w-full rounded-[10px] bg-[#e9e9ee] px-3 text-[14px] outline-none placeholder:text-ink-3"
                />
              )}
            </div>
            {create.error && <p className="text-[13px] text-bad">{create.error.message}</p>}
            <Button
              type="submit"
              variant="primary"
              loading={create.isPending}
              disabled={(kind === 'brawler_trophies' && !brawlerId) || (!target && !suggestion && kind !== 'ranked_tier')}
            >
              Ajouter l’objectif
            </Button>
          </form>
        </Card>

        <div className="space-y-4 lg:col-span-7">
          <Card>
            <CardHeader title="En cours" />
            {open.length ? (
              <ul>
                {open.map((goal) => (
                  <GoalItem key={goal.id} goal={goal} />
                ))}
              </ul>
            ) : (
              <EmptyState title="Aucun objectif en cours">Ajoute-en un avec le formulaire.</EmptyState>
            )}
          </Card>
          {done.length > 0 && (
            <Card>
              <CardHeader title="Atteints" />
              <ul>
                {done.map((goal) => (
                  <GoalItem key={goal.id} goal={goal} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
