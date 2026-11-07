import clsx from 'clsx';
import {
  ArrowLeft,
  Award,
  Check,
  Compass,
  Eye,
  Info,
  Lock,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  FAME_PLANETS,
  MAX_FAME_POINTS,
  TOTAL_FAME_LEVELS,
  computeFameProgress,
  type FameMilestone,
} from '../../../shared/fame';
import { useCollection, useOverview } from '../lib/api';
import { fmtInt, fmtPct } from '../lib/format';
import { usePlayerSlug } from '../lib/hooks';
import { FameBadge, PlayerName } from '../components/bs';
import { BattleCardSimulator, CosmeticRewardBadge, DiagonalArrowIcon, PlanetVisual } from '../components/fame';
import { Card, DocLink, ErrorState, LoadingState, PageHeader, ProgressBar, Refetching, Segmented, StatTile } from '../components/ui';

export function FamePage() {
  const slug = usePlayerSlug();
  const { data: overview, error, isLoading, isPlaceholderData } = useOverview(slug);
  const { data: collection } = useCollection(slug);

  const [selectedMilestone, setSelectedMilestone] = useState<FameMilestone | null>(null);
  const [activeTab, setActiveTab] = useState<'road' | 'table'>('road');
  const currentPlanetRef = useRef<HTMLDivElement | null>(null);

  const player = overview?.player;

  // Calcul dynamique de la progression
  const progress = useMemo(() => {
    return computeFameProgress(player?.fame, player?.fameTierName);
  }, [player?.fame, player?.fameTierName]);

  const currentPlanetIndex = useMemo(() => {
    return FAME_PLANETS.findIndex((p) => p.tier === progress.currentTier);
  }, [progress.currentTier]);

  // Brawler favori ou le plus haut en trophées pour le simulateur
  const topBrawler = useMemo(() => {
    if (!collection?.brawlers?.length) return undefined;
    return [...collection.brawlers].sort((a, b) => (b.trophies ?? 0) - (a.trophies ?? 0))[0];
  }, [collection?.brawlers]);

  const scrollToCurrent = () => {
    currentPlanetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (isLoading) return <LoadingState />;
  if (error || !overview || !player) return <ErrorState error={error} />;

  return (
    <Refetching active={isPlaceholderData}>
      {/* En-tête de la page */}
      <PageHeader
        action={<DocLink section="gloire" />}
        title={
          <div className="flex items-center gap-3">
            <Link
              to={`/p/${slug}`}
              className="inline-flex size-9 items-center justify-center rounded-xl bg-fill hover:bg-[#e4e4e9] text-ink-2 hover:text-ink transition-colors"
              title="Retour à l'accueil"
            >
              <ArrowLeft className="size-5" />
            </Link>
            <span>Voie de la Gloire</span>
          </div>
        }
        subtitle={
          <div className="flex flex-wrap items-center gap-x-2 text-[14px]">
            <span className="font-semibold text-ink">
              <PlayerName name={player.name} color={player.nameColor} nameStyle={player.nameStyle} />
            </span>
            <span>·</span>
            <span>{player.tag}</span>
            {player.fameTierName && (
              <>
                <span>·</span>
                <FameBadge name={player.fameTierName} fame={player.fame} />
              </>
            )}
          </div>
        }
      />

      {/* Carte du statut actuel de gloire */}
      <Card className="mb-6 p-6 sm:p-7">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          {/* Planète actuelle */}
          <div className="relative shrink-0 flex flex-col items-center">
            <PlanetVisual tier={progress.currentTier} size={92} />
            <span className="mt-2 text-[12px] font-semibold text-ink-2">
              Niveau {progress.currentLevel}
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="text-[13px] font-medium text-ink-2">Palier actuel</div>
              <h2 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-ink mt-0.5">
                {progress.currentMilestone.fullNameFr}
              </h2>
              <p className="mt-0.5 text-[14px] text-ink-2 leading-relaxed">
                {progress.currentMilestone.planetName} · {FAME_PLANETS.find((p) => p.tier === progress.currentTier)?.description}
              </p>
            </div>

            {/* Jauge de progression sobre */}
            <div className="space-y-2 max-w-xl pt-1">
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="text-ink-2">Progression du niveau</span>
                <span className="font-medium text-ink tnum">
                  {fmtInt(progress.pointsInLevel)} / {fmtInt(progress.currentMilestone.cost)} crédits ({progress.levelProgressPercent} %)
                </span>
              </div>
              <ProgressBar value={progress.levelProgressPercent / 100} />
              {progress.nextMilestone && (
                <p className="text-[12px] text-ink-2">
                  Encore <strong className="font-semibold text-ink">{fmtInt(progress.pointsNeededForNext)} crédits</strong> pour débloquer{' '}
                  <span className="font-medium text-ink">{progress.nextMilestone.reward.title}</span>
                </p>
              )}
            </div>

            {/* Boutons d'action sobres */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                onClick={scrollToCurrent}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-fill hover:bg-[#e4e4e9] text-ink font-medium px-3.5 py-2 text-[13px] transition-colors"
              >
                <Compass className="size-4 text-ink-2" />
                <span>Aller à ma planète</span>
              </button>
              {topBrawler && (
                <button
                  type="button"
                  onClick={() => setSelectedMilestone(progress.currentMilestone)}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-fill hover:bg-[#e4e4e9] text-ink font-medium px-3.5 py-2 text-[13px] transition-colors"
                >
                  <Eye className="size-4 text-ink-2" />
                  <span>Tester ma Carte</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Tuiles statistiques : standardisées avec le reste du dashboard */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-6">
        <StatTile
          label="Points de gloire"
          value={fmtInt(progress.totalPoints)}
          sub={`sur ${fmtInt(MAX_FAME_POINTS)} max`}
        />
        <StatTile
          label="Planète actuelle"
          value={
            <div className="flex items-center gap-2">
              <PlanetVisual tier={progress.currentTier} size={28} />
              <span className="truncate">{progress.currentMilestone.planetName}</span>
            </div>
          }
          sub={`Étape ${currentPlanetIndex + 1} sur 8`}
        />
        <StatTile
          label="Niveaux franchis"
          value={`${progress.unlockedMilestonesCount} / ${TOTAL_FAME_LEVELS}`}
          sub={`${fmtPct(progress.unlockedMilestonesCount / TOTAL_FAME_LEVELS)} complété`}
        />
        <StatTile
          label="Cosmétiques débloqués"
          value={`${progress.unlockedMilestonesCount} / 24`}
          sub="Fonds, avatars & pins"
        />
      </div>

      {/* Onglets de bascule : Voie Spatiale vs Tableau récapitulatif */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <Segmented
          label="Affichage"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'road', label: 'Voie Spatiale (Planète après planète)' },
            { value: 'table', label: 'Tableau des paliers' },
          ]}
        />

        <span className="hidden sm:inline-block text-xs text-ink-3">
          Clique sur une récompense pour la prévisualiser en jeu
        </span>
      </div>

      {/* VUE 1 : LA VOIE SPATIALE (ROAD PLANÈTE APRÈS PLANÈTE) */}
      {activeTab === 'road' && (
        <div className="space-y-6">
          {FAME_PLANETS.map((planet, planetIndex) => {
            const isCurrentPlanet = planet.tier === progress.currentTier;
            const isPastPlanet = currentPlanetIndex > planetIndex;
            const isFuturePlanet = currentPlanetIndex < planetIndex;

            return (
              <div key={planet.tier} ref={isCurrentPlanet ? currentPlanetRef : undefined}>
                <Card
                  className={clsx(
                    'relative transition-all overflow-hidden p-6 sm:p-7',
                    isCurrentPlanet
                      ? 'border-amber-400 ring-2 ring-amber-400/40 bg-gradient-to-b from-amber-500/[0.04] to-surface shadow-sm'
                      : isPastPlanet
                        ? 'bg-surface border-line'
                        : 'bg-fill/40 border-line/60 opacity-80',
                  )}
                >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-5 border-b border-line">
                  {/* Identité de la planète */}
                  <div className="flex items-center gap-4">
                    <PlanetVisual
                      tier={planet.tier}
                      size={60}
                    />

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
                          Étape {planetIndex + 1} sur 8
                        </span>
                        {isCurrentPlanet && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                            <span className="size-1.5 rounded-full bg-amber-500" />
                            Palier en cours
                          </span>
                        )}
                        {isPastPlanet && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            <Check className="size-3" />
                            Complété
                          </span>
                        )}
                        {isFuturePlanet && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[11px] font-bold text-ink-3 border border-line">
                            <Lock className="size-3" />
                            Verrouillé
                          </span>
                        )}
                      </div>

                      <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-ink mt-0.5">
                        Gloire {planet.name} · {planet.planetName}
                      </h3>
                      <p className="text-xs text-ink-2 mt-0.5 line-clamp-1">
                        {planet.description}
                      </p>
                    </div>
                  </div>

                  {/* Coût du palier */}
                  <div className="text-left md:text-right shrink-0">
                    <div className="text-xs font-semibold text-ink">
                      {planet.pointsPerLevel.toLocaleString('fr-FR')} crédits / niveau
                    </div>
                    <div className="text-[11px] text-ink-3 mt-0.5">
                      Début : {planet.startPoints === 0 ? 'Tous brawlers' : `${fmtInt(planet.startPoints)} pts`} · Fin :{' '}
                      {fmtInt(planet.endPoints)} pts
                    </div>
                  </div>
                </div>

                {/* Les 3 niveaux du palier (I, II, III) avec leurs récompenses cosmétiques */}
                <div className="grid gap-4 sm:grid-cols-3 mt-5">
                  {planet.milestones.map((milestone) => {
                    const isUnlocked = progress.milestoneIndex >= milestone.index;
                    const isCurrentNode = progress.milestoneIndex === milestone.index;

                    return (
                      <div
                        key={milestone.fullNameFr}
                        onClick={() => setSelectedMilestone(milestone)}
                        className={clsx(
                          'group relative rounded-2xl p-4 transition-all cursor-pointer border flex flex-col justify-between gap-3',
                          isCurrentNode
                            ? 'bg-amber-500/10 border-amber-400 ring-1 ring-amber-400/40 shadow-xs'
                            : isUnlocked
                              ? 'bg-surface border-line hover:border-line-strong hover:bg-fill/40 shadow-xs'
                              : 'bg-fill/40 border-line/60 opacity-60 hover:opacity-85',
                        )}
                      >
                        {/* En-tête du jalon */}
                        <div className="flex items-center justify-between">
                          <span
                            className={clsx(
                              'text-xs font-bold uppercase tracking-wider',
                              isCurrentNode
                                ? 'text-amber-800'
                                : isUnlocked
                                  ? 'text-ink'
                                  : 'text-ink-3',
                            )}
                          >
                            Niveau {milestone.level}
                          </span>

                          {isUnlocked ? (
                            <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                              <Check className="size-3 stroke-[3]" />
                            </span>
                          ) : (
                            <span className="inline-flex size-5 items-center justify-center rounded-full bg-fill text-ink-3 border border-line">
                              <Lock className="size-2.5" />
                            </span>
                          )}
                        </div>

                        {/* Rendu cosmétique */}
                        <div className="flex items-center gap-3 my-1">
                          <CosmeticRewardBadge
                            type={milestone.reward.type}
                            tier={planet.tier}
                            unlocked={isUnlocked}
                            size="md"
                          />

                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-bold block leading-snug text-ink">
                              {milestone.reward.shortTitle}
                            </span>
                            <span className="text-[11px] text-ink-3 block truncate">
                              {milestone.reward.title}
                            </span>
                          </div>
                        </div>

                        {/* Coût et bouton aperçu */}
                        <div className="flex items-center justify-between pt-2 border-t border-line text-xs">
                          <span className="font-mono text-[11px] text-ink-3">
                            {milestone.cumulativePoints === 0
                              ? '0 pt'
                              : `${fmtInt(milestone.cumulativePoints)} pts`}
                          </span>
                          <span className="inline-flex items-center gap-1 font-semibold text-[11px] text-accent group-hover:underline">
                            <span>Aperçu</span>
                            <DiagonalArrowIcon className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          );
        })}
        </div>
      )}

      {/* VUE 2 : TABLEAU RÉCAPITULATIF DE TOUS LES PALIERS */}
      {activeTab === 'table' && (
        <Card className="overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-line">
            <h3 className="text-lg font-bold text-ink">Tableau des 8 Paliers & 24 Récompenses</h3>
            <p className="text-xs text-ink-2 mt-1">
              Tous les seuils de crédits officiels de Brawl Stars et les récompenses associées.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-fill text-xs uppercase font-semibold text-ink-2 border-b border-line">
                <tr>
                  <th className="py-3 px-4">Planète / Palier</th>
                  <th className="py-3 px-4">Crédits / Niv.</th>
                  <th className="py-3 px-4">Niveau I · Fond de carte</th>
                  <th className="py-3 px-4">Niveau II · Icône</th>
                  <th className="py-3 px-4">Niveau III · Pin</th>
                  <th className="py-3 px-4 text-right">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {FAME_PLANETS.map((planet) => {
                  const isCurrent = planet.tier === progress.currentTier;
                  return (
                    <tr
                      key={planet.tier}
                      className={clsx(
                        'hover:bg-fill-muted transition-colors',
                        isCurrent && 'bg-amber-500/10 font-medium',
                      )}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <PlanetVisual tier={planet.tier} size={36} />
                          <div>
                            <span className="font-bold block text-ink">Gloire {planet.name}</span>
                            <span className="text-xs text-ink-2">{planet.planetName}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">{fmtInt(planet.pointsPerLevel)} pts</td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setSelectedMilestone(planet.milestones[0])}
                          className="hover:underline text-left flex items-center gap-2.5"
                        >
                          <CosmeticRewardBadge
                            type="card"
                            tier={planet.tier}
                            unlocked={progress.milestoneIndex >= planet.milestones[0].index}
                            size="sm"
                          />
                          <div>
                            <div className="font-semibold text-xs text-ink">
                              {fmtInt(planet.milestones[0].cumulativePoints)} pts
                            </div>
                            <div className="text-[11px] text-ink-3">Fond de carte</div>
                          </div>
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setSelectedMilestone(planet.milestones[1])}
                          className="hover:underline text-left flex items-center gap-2.5"
                        >
                          <CosmeticRewardBadge
                            type="icon"
                            tier={planet.tier}
                            unlocked={progress.milestoneIndex >= planet.milestones[1].index}
                            size="sm"
                          />
                          <div>
                            <div className="font-semibold text-xs text-ink">
                              {fmtInt(planet.milestones[1].cumulativePoints)} pts
                            </div>
                            <div className="text-[11px] text-ink-3">Photo de profil</div>
                          </div>
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setSelectedMilestone(planet.milestones[2])}
                          className="hover:underline text-left flex items-center gap-2.5"
                        >
                          <CosmeticRewardBadge
                            type="pin"
                            tier={planet.tier}
                            unlocked={progress.milestoneIndex >= planet.milestones[2].index}
                            size="sm"
                          />
                          <div>
                            <div className="font-semibold text-xs text-ink">
                              {fmtInt(planet.milestones[2].cumulativePoints)} pts
                            </div>
                            <div className="text-[11px] text-ink-3">Pin Collector</div>
                          </div>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-800">
                            En cours
                          </span>
                        ) : FAME_PLANETS.findIndex((p) => p.tier === progress.currentTier) >
                          FAME_PLANETS.findIndex((p) => p.tier === planet.tier) ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                            <Check className="size-3.5" />
                            Acquis
                          </span>
                        ) : (
                          <span className="text-xs text-ink-3">Verrouillé</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Guide informatif et explications en bas de page */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2 font-bold text-ink mb-2">
            <Info className="size-4 text-accent" />
            <h4>Comment fonctionne la conversion en Gloire ?</h4>
          </div>
          <p className="text-xs text-ink-2 leading-relaxed">
            Dès que tu possèdes l’ensemble des brawlers disponibles dans Brawl Stars, tous les crédits que tu obtiens
            (via les paliers du Brawl Pass, la progression en trophées, la maîtrise des brawlers ou les récompenses Starr)
            sont automatiquement injectés dans ta Voie de la Gloire. Chaque crédit équivaut à 1 point de gloire.
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 font-bold text-ink mb-2">
            <Award className="size-4 text-accent" />
            <h4>À quoi servent les récompenses de Gloire ?</h4>
          </div>
          <p className="text-xs text-ink-2 leading-relaxed">
            La Gloire est une progression purement prestigieuse et cosmétique (« flex »). Elle te permet d’équiper des
            fonds de cartes de combat galactiques exclusifs, des icônes de profil planétaires et des pins dorés
            collector qui témoignent de ta maîtrise et de ton dévouement au jeu.
          </p>
        </Card>
      </div>

      {/* MODAL DU SIMULATEUR DE CARTE DE COMBAT */}
      {selectedMilestone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg">
            <BattleCardSimulator
              player={player}
              milestone={selectedMilestone}
              brawler={topBrawler}
              onClose={() => setSelectedMilestone(null)}
            />
          </div>
        </div>
      )}
    </Refetching>
  );
}
