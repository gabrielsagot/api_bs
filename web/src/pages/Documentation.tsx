import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { Card, PageHeader } from '../components/ui';
import { useStatus } from '../lib/api';

// Documentation intégrée. À TENIR À JOUR : toute fonctionnalité ajoutée, modifiée
// ou retirée dans l'app doit être reflétée ici (voir CLAUDE.md).

const DOC_VERSION = '1.1.1';

interface Section {
  id: string;
  title: string;
  group: string;
  keywords: string;
  body: ReactNode;
}

// ── Petits composants de mise en page ─────────────────────────

function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[15px] leading-relaxed text-ink">{children}</p>;
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-6 text-[16px] font-semibold tracking-tight">{children}</h3>;
}

function List({ children }: { children: ReactNode }) {
  return <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed marker:text-ink-3">{children}</ul>;
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl bg-fill px-4 py-3 font-mono text-[13px] leading-relaxed text-ink">{children}</div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div className="mt-4 rounded-xl bg-accent-soft px-4 py-3 text-[14px] leading-relaxed text-ink">{children}</div>;
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-fill px-1 py-[1px] font-mono text-[13px]">{children}</code>;
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-line">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="bg-fill/70">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-[12px] font-medium text-ink-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-line align-top">
              {row.map((cell, j) => (
                <td key={j} className={clsx('px-3 py-2', j === 0 && 'font-medium')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a href={`#${to}`} className="font-medium text-accent hover:underline">
      {children}
    </a>
  );
}

// ── Contenu ───────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    id: 'presentation',
    title: 'Présentation',
    group: 'Démarrer',
    keywords: 'présentation données api officielle brawlify local privé',
    body: (
      <>
        <P>
          Brawl Dashboard est une application <strong>locale et privée</strong> qui suit ton compte Brawl Stars grâce à
          l’API officielle et gratuite de Supercell. Elle tourne sur ton ordinateur (ou une machine allumée en continu) et
          s’ouvre dans le navigateur, sur ordinateur comme sur téléphone.
        </P>
        <H3>D’où viennent les données</H3>
        <List>
          <li>
            <strong>API officielle Brawl Stars</strong> : profil, brawlers, 25 derniers combats, rotation des maps, catalogue
            des brawlers.
          </li>
          <li>
            <strong>Brawlify</strong> (site communautaire) : images des brawlers, maps et icônes, ainsi que la rareté des
            brawlers. Tout fonctionne sans, les images étant alors remplacées par des initiales.
          </li>
          <li>
            <strong>Le dashboard lui-même</strong> : l’API ne garde aucun historique. Tout ce qui est « dans le temps » (courbes,
            sessions, points par set, statistiques sur 30 jours…) est construit par l’app en enregistrant les données à
            chaque collecte, dans une base SQLite locale.
          </li>
        </List>
        <Note>Rien n’est envoyé ailleurs que vers l’API de Supercell et le CDN de Brawlify. Tes données restent sur ta machine.</Note>
      </>
    ),
  },
  {
    id: 'demarrage',
    title: 'Installation et lancement',
    group: 'Démarrer',
    keywords: 'installation npm start env configuration demo node',
    body: (
      <>
        <P>Prérequis : Node.js 22.13 ou plus récent (conseillé : 24 LTS) et un compte gratuit sur developer.brawlstars.com.</P>
        <Formula>
          npm install
          <br />
          cp .env.example .env # puis remplis-le
          <br />
          npm start # → http://localhost:4777
        </Formula>
        <H3>Fichier .env</H3>
        <Table
          head={['Variable', 'Rôle']}
          rows={[
            [<Code>BS_DEV_EMAIL</Code>, 'Email du compte developer.brawlstars.com (gestion automatique de la clé API).'],
            [<Code>BS_DEV_PASSWORD</Code>, 'Mot de passe de ce compte. Entre guillemets simples s’il contient #, un espace ou des guillemets.'],
            [<Code>BS_API_KEY</Code>, 'Clé manuelle, utilisée seulement si email et mot de passe sont vides.'],
            [<Code>BS_PLAYER_TAG</Code>, 'Tag(s) suivi(s) au premier lancement, sans le # (plusieurs : séparés par des virgules).'],
            [<Code>HOST</Code>, '0.0.0.0 = accessible depuis le téléphone ; 127.0.0.1 = cet ordinateur uniquement.'],
            [<Code>PORT</Code>, 'Port du dashboard (4777 par défaut).'],
            [<Code>POLL_ACTIVE_SECONDS</Code>, 'Fréquence de collecte pendant une session de jeu (120 s par défaut, 30 s minimum).'],
            [<Code>POLL_IDLE_SECONDS</Code>, 'Fréquence de collecte au repos (600 s par défaut, 60 s minimum).'],
            [<Code>DATA_DIR</Code>, 'Dossier de la base, des sauvegardes et du cache d’images (./data par défaut).'],
            [<Code>BS_API_BASE_URL</Code>, 'URL de l’API (ex. un proxy). Avancé.'],
            [<Code>BS_KEY_NAME</Code>, 'Nom des clés créées automatiquement (brawl-dashboard par défaut). Avancé.'],
          ]}
        />
        <H3>Mode démo</H3>
        <P>
          <Code>npm run demo</Code> lance l’app avec 45 jours de données fictives pour 3 joueurs, sans clé API. La base de démo
          est recréée à chaque lancement et n’affecte jamais tes vraies données.
        </P>
      </>
    ),
  },
  {
    id: 'navigation',
    title: 'Les pages en un coup d’œil',
    group: 'Démarrer',
    keywords: 'pages navigation menu onglets',
    body: (
      <>
        <Table
          head={['Page', 'À quoi elle sert']}
          rows={[
            [<PageLink to="accueil">Accueil</PageLink>, 'Résumé centré sur le Ranked : rang, points, sets, dernière session, objectifs, trophées.'],
            [<PageLink to="en-direct">En direct</PageLink>, 'À garder sur le téléphone pendant que tu joues : points gagnés, sets, série.'],
            [<PageLink to="ranked">Ranked</PageLink>, 'Analyse complète du mode classé : sets, points, brawlers, maps, adversaires, coéquipiers.'],
            [<PageLink to="trophees">Trophées</PageLink>, 'Courbe des trophées, variation par jour, prestige, séries de victoires.'],
            [<PageLink to="combats">Combats</PageLink>, 'Historique filtrable de toutes tes parties et statistiques détaillées.'],
            [<PageLink to="brawlers">Brawlers</PageLink>, 'Collection, équipement, coût restant et priorités d’amélioration.'],
            [<PageLink to="rotation">Rotation</PageLink>, 'Les maps du moment et les brawlers conseillés d’après ton historique.'],
            [<PageLink to="objectifs">Objectifs</PageLink>, 'Tes caps (trophées, rang, points…) avec une date d’arrivée estimée.'],
            [<PageLink to="comparer">Comparer</PageLink>, 'Plusieurs joueurs côte à côte.'],
            [<PageLink to="reglages">Réglages</PageLink>, 'Joueurs suivis, clé API, collecte, téléphone, sauvegardes, export.'],
          ]}
        />
        <P>
          Sur ordinateur, toutes les pages sont dans la barre latérale. Sur téléphone, la barre du bas donne Accueil, En direct,
          Ranked et Brawlers ; les autres pages sont dans « Plus ». Le sélecteur en haut change de joueur suivi. Chaque page
          a un lien « Aide » qui mène à sa section ici.
        </P>
        <P>
          Sur cette page, le sommaire à gauche (sur ordinateur) suit ta lecture : la section affichée à l’écran y est mise en
          évidence au fil du défilement. La recherche filtre les sections par titre et par mots-clés.
        </P>
        <P>
          Les filtres (période, file, type…) sont gardés dans l’adresse de la page : tu peux la mettre en favori ou la
          partager. Les données se rafraîchissent automatiquement toutes les minutes (toutes les 20 s sur « En direct »).
        </P>
      </>
    ),
  },
  {
    id: 'accueil',
    title: 'Accueil',
    group: 'Pages',
    keywords: 'accueil rang ranked points records winrate sets série trophées session objectifs',
    body: (
      <>
        <List>
          <li>
            <strong>Rang Ranked</strong> : rang actuel, points (ELO) et leur variation sur 30 jours, record de la saison et record
            absolu (lus dans ton profil), et progression vers le rang suivant (voir{' '}
            <PageLink to="calcul-rang-suivant">rang suivant</PageLink>).
          </li>
          <li>
            <strong>Winrate Ranked</strong> sur 30 jours et écart avec les 30 jours précédents, en points de pourcentage.
          </li>
          <li>
            <strong>Sets gagnés</strong> : sets BO3 remportés sur les sets terminés (voir <PageLink to="calcul-sets">sets</PageLink>).
          </li>
          <li>
            <strong>Série en cours</strong> : victoires ou défaites d’affilée, comptées en sets (ou en manches si les sets ne
            sont pas détectables).
          </li>
          <li>
            <strong>Évolution Ranked</strong> : courbe des points (dès qu’ils ont bougé depuis le début du suivi) ou marches du
            rang lues dans tes parties. Le bouton en haut à droite bascule en vue tableau.
          </li>
          <li>
            <strong>Derniers sets</strong>, <strong>tes brawlers</strong> et <strong>tes maps</strong> en Ranked sur 30 jours.
          </li>
          <li>
            <strong>Dernière session</strong>, trois <strong>objectifs</strong> en cours et un résumé des{' '}
            <strong>trophées</strong> (7 jours).
          </li>
        </List>
      </>
    ),
  },
  {
    id: 'en-direct',
    title: 'En direct',
    group: 'Pages',
    keywords: 'en direct session live téléphone points set série',
    body: (
      <>
        <P>
          L’écran à garder à côté de toi pendant que tu joues. Il affiche la session en cours (ou la dernière s’il n’y en a
          pas) et se rafraîchit toutes les 20 secondes. Pendant une session, la collecte passe automatiquement à toutes les
          2 minutes ; le bouton « Actualiser » force une collecte immédiate.
        </P>
        <List>
          <li>
            <strong>Points Ranked sur la session</strong> : points actuels moins les points mesurés au début de la session. Si
            aucune mesure n’existait juste avant la session, l’écart n’est pas affiché.
          </li>
          <li>
            <strong>Rang suivant</strong> : points restants et estimation en nombre de sets.
          </li>
          <li>
            <strong>Sets</strong>, <strong>manches Ranked</strong>, <strong>série</strong> et <strong>trophées</strong> de la
            session.
          </li>
          <li>Les sets de la session avec les points gagnés ou perdus, les brawlers joués et les dernières parties.</li>
        </List>
        <P>
          Une session regroupe des parties espacées de moins de 30 minutes. Elle est dite « en cours » si la dernière partie
          date de moins de 30 minutes.
        </P>
      </>
    ),
  },
  {
    id: 'ranked',
    title: 'Ranked',
    group: 'Pages',
    keywords: 'ranked sets points elo brawler map mode adversaires coéquipiers duo picks historique file solo équipe',
    body: (
      <>
        <P>
          Filtres : période (7 j, 30 j, 90 j, tout) et file (toutes, solo, en équipe). Toutes les statistiques de la page
          suivent ces filtres.
        </P>
        <List>
          <li>
            <strong>Chiffres clés</strong> : points (et variation sur la période), rang actuel, records de la saison et absolu,
            winrate des manches (et écart avec la période précédente de même durée), sets gagnés, taux de star player, série
            en cours.
          </li>
          <li>
            <strong>Évolution Ranked</strong> et <strong>Rang suivant</strong> (points restants, points moyens par set, nombre
            de sets mesurés).
          </li>
          <li>
            <strong>Par brawler</strong>, <strong>par map</strong>, <strong>par mode</strong> : parties, victoires – défaites,
            winrate, star player et <strong>points nets</strong> (somme des points des sets mesurés).
          </li>
          <li>
            <strong>Brawlers adverses</strong> : ton winrate quand un brawler est dans l’équipe adverse (2 manches minimum).
          </li>
          <li>
            <strong>Avec tes coéquipiers</strong> : pour chaque coéquipier régulier, ton winrate avec lui, sans lui, l’écart, les
            points nets des sets joués ensemble et vos meilleurs duos de brawlers (2 parties minimum par duo).
          </li>
          <li>
            <strong>Meilleurs picks par map</strong> : tes brawlers les plus efficaces sur chaque map (voir{' '}
            <PageLink to="calcul-winrate-lisse">winrate lissé</PageLink>).
          </li>
          <li>
            <strong>Historique des sets</strong> : score, points gagnés ou perdus, map, rang, compositions des deux équipes.
          </li>
        </List>
      </>
    ),
  },
  {
    id: 'trophees',
    title: 'Trophées',
    group: 'Pages',
    keywords: 'trophées courbe variation jour prestige palier série victoires record',
    body: (
      <>
        <List>
          <li>
            <strong>Chiffres clés</strong> sur la période : trophées, variation, record, parties de trophées, gain moyen par
            partie.
          </li>
          <li>
            <strong>Évolution des trophées</strong> : chaque point est une mesure prise par le dashboard.
          </li>
          <li>
            <strong>Variation par jour</strong> : clôture du jour moins clôture précédente, en heure locale.
          </li>
          <li>
            <strong>Prochains paliers de prestige</strong> : les brawlers les plus proches de leur prochain palier (tous les
            1 000 trophées), avec une estimation du nombre de parties (voir <PageLink to="calcul-prestige">calcul</PageLink>).
          </li>
          <li>
            <strong>Séries en cours</strong> : brawlers avec au moins 2 victoires d’affilée, et leur record (données du jeu).
          </li>
          <li>
            <strong>Par brawler</strong> : niveau, trophées, variation sur la période, record, parties, winrate, série
            (en cours / record).
          </li>
        </List>
      </>
    ),
  },
  {
    id: 'combats',
    title: 'Combats',
    group: 'Pages',
    keywords: 'combats historique filtres mode brawler map sessions coéquipiers export csv',
    body: (
      <>
        <P>
          Filtres combinables : période, type (Ranked, Trophées, Amical, Autres), mode, brawler, map. Le bouton « Exporter en
          CSV » télécharge tous tes combats enregistrés.
        </P>
        <List>
          <li>
            <strong>Chiffres clés</strong> : parties, winrate, star player (modes en 3c3), trophées nets, durée moyenne,
            meilleure série de victoires.
          </li>
          <li>Tableaux par mode, par brawler, par map, brawlers adverses (3 parties minimum) et coéquipiers réguliers.</li>
          <li>
            <strong>Sessions</strong> : parties espacées de moins de 30 minutes, avec bilan et trophées.
          </li>
          <li>
            <strong>Historique</strong> : touche une ligne pour voir les deux équipes (joueurs, brawlers, niveaux).
          </li>
        </List>
        <Note>
          Attention au vocabulaire de l’API : le type « ranked » y désigne les parties de trophées ; le mode Ranked apparaît
          comme « soloRanked » ou « teamRanked ». Le dashboard fait la distinction pour toi.
        </Note>
      </>
    ),
  },
  {
    id: 'brawlers',
    title: 'Brawlers',
    group: 'Pages',
    keywords: 'brawlers collection gadgets star powers hypercharges gears buffies coût maxer priorités amélioration rareté fiche',
    body: (
      <>
        <List>
          <li>
            <strong>Chiffres clés</strong> : brawlers débloqués, niveau 11 (dont complets), gadgets, star powers, hypercharges,
            buffies, coût restant pour tout maxer en pièces et points de puissance.
          </li>
          <li>
            <strong>À améliorer en priorité</strong> : tes brawlers les plus joués et les plus efficaces, avec leur prochaine
            étape et son prix (voir <PageLink to="calcul-priorites">calcul</PageLink>).
          </li>
          <li>
            <strong>Grille</strong> : recherche, filtre débloqués / à débloquer, tri (trophées, niveau, coût restant, winrate,
            rareté, série max, nom), filtre par rareté. Les points indiquent gadgets (G), star powers (SP) et hypercharges
            (HC) possédés.
          </li>
          <li>
            <strong>Fiche d’un brawler</strong> (clic sur une tuile) : trophées dans le temps, winrate par mode et par map,
            équipement possédé ou manquant (gadgets, star powers, hypercharge, gears, buffies), détail du coût restant et
            dernières parties.
          </li>
        </List>
        <P>
          Le coût restant compte les niveaux, les gadgets, les star powers et l’hypercharge manquants (voir{' '}
          <PageLink to="calcul-couts">barème</PageLink>). Les gears et les buffies sont affichés mais pas chiffrés, faute de
          prix fixe fiable.
        </P>
      </>
    ),
  },
  {
    id: 'rotation',
    title: 'Rotation',
    group: 'Pages',
    keywords: 'rotation maps événements recommandations conseillés',
    body: (
      <>
        <P>
          Les événements en cours (relus au moins toutes les 10 minutes et dès qu’un événement se termine), avec ton bilan
          sur chaque map et jusqu’à 4 brawlers conseillés d’après tes 180 derniers jours (voir{' '}
          <PageLink to="calcul-recommandations">calcul</PageLink>). Un brawler n’est conseillé que s’il fait au moins aussi
          bien que ta moyenne sur le mode.
        </P>
      </>
    ),
  },
  {
    id: 'objectifs',
    title: 'Objectifs',
    group: 'Pages',
    keywords: 'objectifs goals cible estimation date rythme',
    body: (
      <>
        <P>Types d’objectifs : trophées totaux, rang Ranked, points Ranked, trophées d’un brawler, brawlers niveau 11, brawlers débloqués, victoires 3v3.</P>
        <List>
          <li>La progression part de la valeur au moment où l’objectif est créé.</li>
          <li>Un objectif est marqué « atteint » automatiquement dès que la valeur actuelle atteint la cible.</li>
          <li>
            La date estimée vient de ton rythme récent (voir <PageLink to="calcul-objectifs">calcul</PageLink>) ; sans
            progression récente, l’app l’indique au lieu d’inventer une date.
          </li>
        </List>
      </>
    ),
  },
  {
    id: 'comparer',
    title: 'Comparer',
    group: 'Pages',
    keywords: 'comparer joueurs potes multi comptes',
    body: (
      <>
        <P>
          Jusqu’à 4 joueurs suivis côte à côte : tableau de chiffres (la meilleure valeur de chaque ligne en gras), courbe des
          trophées sur 30 jours (en progression ou en valeurs absolues) et comparaison brawler par brawler. Chaque joueur
          garde toujours la même couleur. Ajoute tes autres comptes ou tes potes dans les Réglages.
        </P>
      </>
    ),
  },
  {
    id: 'reglages',
    title: 'Réglages',
    group: 'Pages',
    keywords: 'réglages joueurs suivis principal clé collecte téléphone qr code sauvegardes export données',
    body: (
      <List>
        <li>
          <strong>Joueurs suivis</strong> : ajout par tag (le O est corrigé en 0 automatiquement), suppression (efface son
          historique), choix du joueur principal (ouvert par défaut).
        </li>
        <li>
          <strong>Clé API</strong> : mode, état, IP autorisées, dernier message, bouton pour recréer la clé (mode
          automatique).
        </li>
        <li>
          <strong>Collecte</strong> : dernière et prochaine collecte, fréquences, dernière erreur, bouton « Actualiser ».
        </li>
        <li>
          <strong>Sur ton téléphone</strong> : adresses réseau local et QR code.
        </li>
        <li>
          <strong>Sauvegardes et export</strong> : liste des sauvegardes, sauvegarde immédiate, export CSV des combats et de
          la progression de chaque joueur.
        </li>
        <li>
          <strong>Données</strong> : date de début du suivi, nombre de combats et de mesures, taille de la base.
        </li>
      </List>
    ),
  },
  {
    id: 'calcul-winrate',
    title: 'Winrate, séries, star player',
    group: 'Calculs',
    keywords: 'winrate calcul égalité série star player survivant classement',
    body: (
      <>
        <Formula>winrate = victoires / (victoires + défaites) — les égalités ne comptent pas</Formula>
        <List>
          <li>
            <strong>Survivant</strong> (classement) : une variation de trophées positive compte comme une victoire, négative
            comme une défaite ; sans variation, la moitié haute du classement compte comme une victoire.
          </li>
          <li>
            <strong>Série</strong> : résultats identiques consécutifs en partant du plus récent (les parties sans résultat sont
            ignorées).
          </li>
          <li>
            <strong>Taux de star player</strong> : parties où tu es star player / parties en équipes (deux équipes) avec un
            résultat.
          </li>
          <li>
            <strong>Écart de winrate</strong> : différence en points de pourcentage avec la période précédente de même durée.
          </li>
        </List>
      </>
    ),
  },
  {
    id: 'calcul-winrate-lisse',
    title: 'Winrate lissé',
    group: 'Calculs',
    keywords: 'winrate lissé bayésien petits échantillons',
    body: (
      <>
        <P>
          Pour classer des brawlers, un 2 – 0 ne doit pas passer devant un 30 – 12. Le winrate est donc « tiré » vers une
          valeur de référence tant qu’il y a peu de parties :
        </P>
        <Formula>winrate lissé = (victoires + référence × k) / (victoires + défaites + k)</Formula>
        <P>Utilisé pour les meilleurs picks par map (k = 8, référence = ton winrate sur la map), les recommandations de la rotation et les priorités d’amélioration.</P>
      </>
    ),
  },
  {
    id: 'calcul-sets',
    title: 'Sets Ranked (BO3)',
    group: 'Calculs',
    keywords: 'sets bo3 manches regroupement en cours incomplet',
    body: (
      <>
        <P>L’API liste chaque manche séparément. Les manches sont regroupées en sets quand elles sont consécutives et :</P>
        <List>
          <li>même file (solo ou équipe), même map, mêmes adversaires ;</li>
          <li>moins de 12 minutes entre deux manches ;</li>
          <li>le set n’est pas déjà décidé (2 victoires ou 2 défaites).</li>
        </List>
        <P>
          Un set non décidé est « en cours » si sa dernière manche date de moins de 15 minutes, sinon « incomplet » (typiquement
          quand ses premières manches datent d’avant le début du suivi). Les sets en cours ou incomplets ne comptent pas dans
          le winrate des sets. Si aucun set à plusieurs manches n’est jamais détecté, chaque manche est traitée comme un match.
        </P>
      </>
    ),
  },
  {
    id: 'calcul-points-set',
    title: 'Points gagnés ou perdus par set',
    group: 'Calculs',
    keywords: 'points elo set mesure relevé',
    body: (
      <>
        <P>
          Ton profil ne donne que tes points actuels. Le dashboard les relève à chaque collecte et recoupe ces relevés avec
          l’heure des sets :
        </P>
        <Formula>points du set = relevé pris après le set (et avant le suivant) − relevé qui précède le set</Formula>
        <P>
          Un set n’est chiffré que si c’est sans ambiguïté : il faut un relevé entre la fin du set et le début du suivant, et
          un relevé qui reflète l’état juste avant le set. Sinon il affiche « — ». Ces mesures alimentent les points nets par
          brawler, map, mode et coéquipier, et la moyenne de points par set.
        </P>
        <Note>
          Plus la collecte est fréquente, plus il y a de sets chiffrés : en session elle passe à toutes les 2 minutes, ce qui
          suffit généralement. Les sets joués avant le début du suivi ne peuvent pas être chiffrés.
        </Note>
      </>
    ),
  },
  {
    id: 'calcul-rang-suivant',
    title: 'Rang suivant',
    group: 'Calculs',
    keywords: 'rang suivant seuil points restants sets estimation elo',
    body: (
      <>
        <P>
          Les seuils ne sont pas fournis par l’API. Ils sont estimés à 500 points par rang à partir d’Argent II, ce que
          confirment les données réelles (Mythique III à partir de 5 500 points, Légendaire II à partir de 6 500). Si le
          dashboard observe un rang atteint avec moins de points que prévu, il corrige le seuil.
        </P>
        <Formula>
          points restants = seuil du rang suivant − points actuels
          <br />
          sets estimés = points restants / moyenne des points des 20 derniers sets mesurés (si elle est positive)
        </Formula>
        <P>Pour les tout premiers rangs (Bronze, Argent I), le seuil est inconnu et rien n’est affiché.</P>
      </>
    ),
  },
  {
    id: 'calcul-duo',
    title: 'Coéquipiers réguliers et duos',
    group: 'Calculs',
    keywords: 'coéquipiers réguliers duo avec sans écart',
    body: (
      <>
        <P>
          Un coéquipier est « régulier » s’il a joué au moins 3 parties avec toi, avec au moins 30 minutes entre la première
          et la dernière : un inconnu croisé sur les 3 manches d’un seul set n’en fait pas partie.
        </P>
        <List>
          <li>« Winrate ensemble » : parties où il est dans ton équipe ; « sans lui » : toutes les autres parties de la période.</li>
          <li>« Points » : somme des points des sets mesurés joués ensemble.</li>
          <li>« Meilleurs duos » : vos combinaisons de brawlers avec au moins 2 parties, par winrate.</li>
        </List>
      </>
    ),
  },
  {
    id: 'calcul-sessions',
    title: 'Sessions et variations',
    group: 'Calculs',
    keywords: 'sessions variation delta historique une heure clôture jour',
    body: (
      <List>
        <li>Une session regroupe des parties espacées de moins de 30 minutes.</li>
        <li>
          Les variations (trophées, points) comparent la valeur actuelle à la dernière mesure prise avant le début de la
          période, ou à la première mesure si le suivi a commencé pendant la période.
        </li>
        <li>
          Tant qu’il y a moins d’une heure d’historique, les variations affichent « — » plutôt qu’un « 0 » trompeur.
        </li>
        <li>Les variations par jour utilisent le jour local de la machine qui fait tourner le dashboard.</li>
      </List>
    ),
  },
  {
    id: 'calcul-recommandations',
    title: 'Recommandations de la rotation',
    group: 'Calculs',
    keywords: 'recommandations conseillés rotation map mode lissage',
    body: (
      <>
        <P>Pour chaque événement, à partir de tes parties des 180 derniers jours :</P>
        <List>
          <li>référence = ton winrate global sur le mode ;</li>
          <li>winrate du brawler sur le mode, lissé vers cette référence (k = 6) ;</li>
          <li>
            si le brawler compte au moins 2 parties décidées sur la map : winrate sur la map, lissé vers son winrate sur le
            mode (k = 6) ; sinon, son winrate lissé sur le mode (légèrement pénalisé, × 0,98) s’il y a au moins 2 parties ;
          </li>
          <li>seuls les brawlers au moins aussi bons que ta moyenne sur le mode sont gardés ; les 4 meilleurs sont affichés.</li>
        </List>
      </>
    ),
  },
  {
    id: 'calcul-prestige',
    title: 'Planificateur de prestige',
    group: 'Calculs',
    keywords: 'prestige palier trophées estimation parties',
    body: (
      <>
        <Formula>
          palier suivant = (partie entière de trophées / 1 000 + 1) × 1 000
          <br />
          parties estimées = trophées restants / gain moyen par partie de trophées du brawler (30 derniers jours)
        </Formula>
        <P>Les brawlers sont triés par nombre de parties estimées, puis par trophées restants. Sans gain moyen positif, pas d’estimation.</P>
      </>
    ),
  },
  {
    id: 'calcul-priorites',
    title: 'Priorités d’amélioration',
    group: 'Calculs',
    keywords: 'priorités amélioration achat prochaine étape score',
    body: (
      <>
        <P>Pour chaque brawler débloqué et pas encore complet, joué au moins une fois ces 60 derniers jours :</P>
        <Formula>score = (parties + 0,5 × parties Ranked) × (0,5 + winrate lissé vers 50 %, k = 6)</Formula>
        <P>
          Les 8 meilleurs scores sont affichés avec leur prochaine étape, dans cet ordre : niveau suivant (jusqu’au 11),
          puis gadget, star power et hypercharge manquants. Les buffies à débloquer sont signalés.
        </P>
      </>
    ),
  },
  {
    id: 'calcul-objectifs',
    title: 'Estimation des objectifs',
    group: 'Calculs',
    keywords: 'objectifs estimation régression rythme date',
    body: (
      <P>
        Le rythme est une régression linéaire sur les valeurs de fin de journée des 14 derniers jours (au moins deux points
        couvrant une journée ou plus). Date estimée = aujourd’hui + (cible − valeur actuelle) / rythme par jour, si le rythme
        est positif.
      </P>
    ),
  },
  {
    id: 'calcul-couts',
    title: 'Barème des améliorations',
    group: 'Calculs',
    keywords: 'coûts pièces points de puissance niveaux gadget star power hypercharge barème',
    body: (
      <>
        <Table
          head={['Étape', 'Pièces', 'Points de puissance']}
          rows={[
            ['Niveau 1 → 2', '20', '20'],
            ['Niveau 2 → 3', '35', '30'],
            ['Niveau 3 → 4', '75', '50'],
            ['Niveau 4 → 5', '140', '80'],
            ['Niveau 5 → 6', '290', '130'],
            ['Niveau 6 → 7', '480', '210'],
            ['Niveau 7 → 8', '800', '340'],
            ['Niveau 8 → 9', '1 250', '550'],
            ['Niveau 9 → 10', '1 875', '890'],
            ['Niveau 10 → 11', '2 800', '1 440'],
            ['Gadget', '1 000', '—'],
            ['Star power', '2 000', '—'],
            ['Hypercharge', '5 000', '—'],
          ]}
        />
        <P>
          Ces prix sont définis dans <Code>server/stats/costs.ts</Code> : si Supercell change l’économie du jeu, c’est le seul
          fichier à modifier.
        </P>
      </>
    ),
  },
  {
    id: 'donnees',
    title: 'Collecte et stockage des données',
    group: 'Fonctionnement',
    keywords: 'collecte fréquence 25 combats stockage sqlite base mesures images cache sauvegardes export',
    body: (
      <>
        <List>
          <li>
            <strong>Collecte</strong> : toutes les 2 minutes si une partie a été jouée dans les 20 dernières minutes, sinon toutes
            les 10 minutes (réglable). Chaque collecte lit le profil et les 25 derniers combats de chaque joueur suivi.
          </li>
          <li>
            <strong>Pourquoi c’est important</strong> : l’API ne garde que les 25 derniers combats. Si tu joues plus de 25
            parties pendant que le dashboard est éteint, les plus anciennes sont perdues. L’historique commence au premier
            lancement.
          </li>
          <li>
            <strong>Mesures de profil</strong> : une mesure n’est enregistrée que si quelque chose a changé (trophées, points,
            niveau…), de même pour chaque brawler.
          </li>
          <li>
            <strong>Combats</strong> : dédoublonnés (un même combat n’est jamais compté deux fois).
          </li>
          <li>
            <strong>Catalogue</strong> des brawlers relu une fois par jour ; <strong>rotation</strong> toutes les 10 minutes.
          </li>
          <li>
            <strong>Images</strong> : téléchargées une seule fois puis servies depuis <Code>data/img</Code>.
          </li>
          <li>
            <strong>Base</strong> : <Code>data/brawl.sqlite</Code>. Pour tout sauvegarder à la main, copie le dossier{' '}
            <Code>data/</Code>.
          </li>
          <li>
            <strong>Sauvegardes automatiques</strong> : une par semaine dans <Code>data/backups</Code> (les 8 dernières sont
            gardées), plus le bouton « Sauvegarder maintenant ». Pour restaurer : arrête l’app, remplace{' '}
            <Code>data/brawl.sqlite</Code> par une sauvegarde, relance.
          </li>
          <li>
            <strong>Export CSV</strong> (séparateur « ; », compatible Excel et Numbers) : combats (date, type, mode, map,
            brawler, résultat, trophées, équipes…) et progression (trophées, points Ranked, niveau…).
          </li>
        </List>
      </>
    ),
  },
  {
    id: 'cle-api',
    title: 'Clé API',
    group: 'Fonctionnement',
    keywords: 'clé api ip portail développeur automatique manuel proxy 403',
    body: (
      <>
        <P>Les clés de l’API Brawl Stars sont verrouillées sur une ou plusieurs adresses IP publiques.</P>
        <H3>Gestion automatique (recommandée)</H3>
        <List>
          <li>L’app se connecte au portail développeur avec ton email et ton mot de passe, et lit l’IP vue par Supercell.</li>
          <li>Elle réutilise sa clé « brawl-dashboard » si elle autorise cette IP, sinon elle en crée une (et révoque son ancienne clé).</li>
          <li>
            Si l’API refuse la clé (IP changée), l’app ajoute à une nouvelle clé l’IP que l’API indique réellement et rejoue la
            requête (jusqu’à 5 IP par clé).
          </li>
          <li>
            Un compte a droit à 10 clés : à la limite, l’app ne supprime que ses propres clés, jamais celles créées à la main.
          </li>
          <li>Avec de mauvais identifiants, une seule tentative par minute.</li>
        </List>
        <H3>Autres modes</H3>
        <List>
          <li>
            <strong>Clé manuelle</strong> (<Code>BS_API_KEY</Code>) : si ton IP change, les Réglages affichent l’IP à déclarer
            sur le portail.
          </li>
          <li>
            <strong>Proxy</strong> : <Code>BS_API_BASE_URL</Code> permet de passer par un proxy (ex. RoyaleAPI) dont l’IP est
            fixe.
          </li>
        </List>
        <Note>La clé et tes identifiants ne sont jamais envoyés au navigateur : seul le serveur local les utilise.</Note>
      </>
    ),
  },
  {
    id: 'telephone',
    title: 'Sur ton téléphone',
    group: 'Fonctionnement',
    keywords: 'téléphone iphone wifi qr code écran accueil coupe-feu sécurité',
    body: (
      <List>
        <li>Même Wi-Fi que la machine qui fait tourner le dashboard ; adresse et QR code dans les Réglages.</li>
        <li>Dans Safari : Partager › « Sur l’écran d’accueil » pour l’ouvrir comme une app.</li>
        <li>Si la page ne charge pas : autoriser Node dans le coupe-feu (Réglages Système › Réseau › Coupe-feu).</li>
        <li>
          Toute personne sur ton Wi-Fi peut ouvrir le dashboard (données publiques du jeu uniquement). Pour le réserver à
          l’ordinateur : <Code>HOST=127.0.0.1</Code>. Les actions qui modifient des données exigent un en-tête spécial,
          ce qui empêche un site tiers de les déclencher.
        </li>
      </List>
    ),
  },
  {
    id: 'h24',
    title: 'Faire tourner le dashboard 24 h/24',
    group: 'Fonctionnement',
    keywords: 'démarrage automatique launchd mac linux systemd raspberry pi nas docker compose',
    body: (
      <>
        <P>Plus le dashboard tourne, plus ton historique est complet.</P>
        <Table
          head={['Machine', 'Commande']}
          rows={[
            ['Mac (au démarrage de session)', <Code>./scripts/macos-autostart.sh install</Code>],
            ['Linux / Raspberry Pi (service systemd)', <Code>./scripts/linux-service.sh install</Code>],
            ['NAS ou serveur avec Docker', <Code>docker compose up -d</Code>],
          ]}
        />
        <P>
          Les deux scripts acceptent aussi <Code>uninstall</Code>, <Code>restart</Code> (après une mise à jour du code),{' '}
          <Code>status</Code> et <Code>logs</Code>. Avec Docker, le fichier <Code>.env</Code> est lu tel quel et les données
          restent dans <Code>./data</Code> sur la machine hôte. Sur Mac, la collecte est en pause quand l’ordinateur est en
          veille.
        </P>
      </>
    ),
  },
  {
    id: 'limites',
    title: 'Limites connues',
    group: 'Fonctionnement',
    keywords: 'limites api historique bans meta',
    body: (
      <List>
        <li>Pas d’historique avant le premier lancement, et 25 combats maximum entre deux collectes.</li>
        <li>Les points par set ne sont mesurables que pour les sets joués pendant que le dashboard tourne.</li>
        <li>Les seuils de rang sont estimés (500 points par rang) ; les tout premiers rangs ne sont pas couverts.</li>
        <li>L’API ne donne ni les bans du Ranked, ni les statistiques mondiales (méta) : tout est calculé sur tes parties.</li>
        <li>La rareté et les images dépendent de Brawlify ; si le site est indisponible, l’app fonctionne sans.</li>
        <li>Les prix d’amélioration sont ceux connus à ce jour (modifiables dans le code).</li>
      </List>
    ),
  },
  {
    id: 'depannage',
    title: 'Dépannage',
    group: 'Fonctionnement',
    keywords: 'dépannage erreur problème identifiants ip port node téléphone tag',
    body: (
      <Table
        head={['Problème', 'Solution']}
        rows={[
          ['« Identifiants refusés par developer.brawlstars.com »', 'Vérifie email et mot de passe dans .env (guillemets si le mot de passe contient #).'],
          ['« Clé refusée pour l’IP … »', 'Mode manuel : ajoute cette IP à ta clé, ou passe en gestion automatique.'],
          ['« Aucune clé configurée »', 'Remplis le .env puis relance l’app.'],
          ['« Node.js … est trop ancien »', 'Mets Node à jour (22.13 minimum).'],
          ['« Le port 4777 est déjà utilisé »', 'L’app tourne déjà (service automatique ?), sinon change PORT.'],
          ['Page blanche après une mise à jour', 'Relance l’app (ou « restart » avec les scripts de service).'],
          ['Le téléphone n’arrive pas à se connecter', 'Même Wi-Fi, coupe-feu, et HOST=0.0.0.0.'],
          ['« Aucun joueur avec le tag … »', 'Le tag ne contient que 0 2 8 9 P Y L Q G R J C U V.'],
          ['Pas de points sur les sets', 'Normal pour les sets joués avant le suivi ; laisse le dashboard tourner pendant tes sessions.'],
        ]}
      />
    ),
  },
  {
    id: 'glossaire',
    title: 'Glossaire',
    group: 'Référence',
    keywords: 'glossaire elo set manche bo3 star player prestige buffies gears hypercharge pp',
    body: (
      <Table
        head={['Terme', 'Sens']}
        rows={[
          ['Points Ranked (ELO)', 'Score du mode classé qui détermine ton rang.'],
          ['Manche', 'Une partie. En Ranked, un set se joue en 2 manches gagnantes.'],
          ['Set (BO3)', 'Match classé au meilleur des 3 manches.'],
          ['File solo / équipe', 'Ranked lancé seul (soloRanked) ou avec des amis (teamRanked).'],
          ['Star player', 'Meilleur joueur de la partie selon le jeu.'],
          ['Prestige', 'Palier franchi tous les 1 000 trophées sur un brawler.'],
          ['Buffies', 'Améliorations supplémentaires des gadgets, star powers et hypercharges.'],
          ['PP', 'Points de puissance, nécessaires pour monter de niveau.'],
          ['Winrate lissé', 'Winrate corrigé pour les petits échantillons (voir Calculs).'],
          ['Session', 'Parties espacées de moins de 30 minutes.'],
        ]}
      />
    ),
  },
  {
    id: 'versions',
    title: 'Journal des versions',
    group: 'Référence',
    keywords: 'versions changelog nouveautés',
    body: (
      <>
        <H3>1.1.1</H3>
        <List>
          <li>Documentation : le sommaire met en évidence la section en cours de lecture pendant le défilement.</li>
        </List>
        <H3>1.1.0</H3>
        <List>
          <li>Points Ranked (ELO) et records de saison / absolu ; courbe des points.</li>
          <li>Points gagnés ou perdus par set, points nets par brawler, map, mode et coéquipier.</li>
          <li>Rang suivant : points restants et estimation en sets.</li>
          <li>Page « En direct » pour suivre une session depuis le téléphone.</li>
          <li>Avec tes coéquipiers : winrate avec / sans, meilleurs duos.</li>
          <li>Planificateur de prestige et séries de victoires par brawler.</li>
          <li>Priorités d’amélioration, buffies, rareté des brawlers rétablie.</li>
          <li>Sauvegardes automatiques, export CSV, hébergement 24 h/24 (Docker, systemd).</li>
          <li>Cette documentation.</li>
        </List>
        <H3>1.0.0</H3>
        <List>
          <li>Première version : collecte, Ranked, trophées, combats, collection, rotation, objectifs, comparaison, réglages.</li>
        </List>
      </>
    ),
  },
];

const GROUPS = ['Démarrer', 'Pages', 'Calculs', 'Fonctionnement', 'Référence'];

/** Hauteur, depuis le haut de la fenêtre, à partir de laquelle une section devient la section active. */
const SPY_OFFSET = 120;

/**
 * Section en cours de lecture : la dernière dont le titre est passé sous SPY_OFFSET,
 * ou la dernière de la page quand on est tout en bas. Une section choisie dans le
 * sommaire reste active tant qu'on ne fait pas défiler la page soi-même (utile pour
 * les dernières sections, qui ne peuvent pas remonter jusqu'en haut de l'écran).
 */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const pinned = useRef<{ id: string; top: number | null } | null>(null);
  const key = ids.join(',');

  const pin = useCallback((id: string) => {
    pinned.current = { id, top: null };
    setActive(id);
  }, []);

  useEffect(() => {
    const list = key ? key.split(',') : [];
    let frame = 0;
    const update = () => {
      frame = 0;
      const p = pinned.current;
      if (p) {
        const top = document.getElementById(p.id)?.getBoundingClientRect().top;
        if (top !== undefined && (p.top === null || Math.abs(top - p.top) < 40)) {
          p.top ??= top;
          return;
        }
        pinned.current = null;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current: string | null = list[0] ?? null;
      if (atBottom) current = list.at(-1) ?? null;
      else {
        for (const id of list) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= SPY_OFFSET) current = id;
          else if (el) break;
        }
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key]);

  return { active, pin };
}

export function DocumentationPage() {
  const location = useLocation();
  const status = useStatus().data;
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? SECTIONS.filter((s) => `${s.title} ${s.keywords}`.toLowerCase().includes(q)) : SECTIONS;
  }, [query]);

  const { active, pin } = useActiveSection(visible.map((s) => s.id));
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = location.hash.slice(1);
    if (!id) return;
    pin(id);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  }, [location.hash, pin]);

  // Garde l'entrée active visible dans le sommaire, sans faire défiler la page.
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!nav || !link) return;
    const top = link.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
    if (top < nav.scrollTop + 60) nav.scrollTop = Math.max(0, top - 60);
    else if (top + link.offsetHeight > nav.scrollTop + nav.clientHeight - 24) {
      nav.scrollTop = top + link.offsetHeight - nav.clientHeight + 24;
    }
  }, [active]);

  return (
    <>
      <PageHeader
        title="Documentation"
        subtitle="Tout ce que fait le dashboard, comment chaque chiffre est calculé, et comment le faire tourner."
        action={<span className="text-[12px] text-ink-3">Version {status?.version ?? DOC_VERSION}</span>}
      />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav ref={navRef} aria-label="Sommaire" className="lg:sticky lg:top-8 lg:max-h-[calc(100dvh-4rem)] lg:self-start lg:overflow-y-auto">
          <label className="relative mb-4 flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3" />
            <span className="sr-only">Rechercher dans la documentation</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher"
              className="h-[32px] w-full rounded-[10px] bg-[#e9e9ee] pl-8 pr-3 text-[13px] outline-none placeholder:text-ink-3"
            />
          </label>
          <div className="hidden lg:block">
            {GROUPS.map((group) => {
              const items = visible.filter((s) => s.group === group);
              if (!items.length) return null;
              return (
                <div key={group} className="mb-4">
                  <div className="mb-1 px-2 text-[12px] font-semibold text-ink-3">{group}</div>
                  {items.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      data-section={s.id}
                      aria-current={active === s.id ? 'location' : undefined}
                      onClick={() => pin(s.id)}
                      className={clsx(
                        'block rounded-lg px-2 py-1 text-[13px] hover:bg-black/[0.04]',
                        active === s.id ? 'font-medium text-accent' : 'text-ink-2',
                      )}
                    >
                      {s.title}
                    </a>
                  ))}
                </div>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0 space-y-4">
          {visible.length === 0 && (
            <Card>
              <p className="text-[14px] text-ink-2">Aucune section ne correspond à « {query} ».</p>
            </Card>
          )}
          {GROUPS.map((group) => {
            const items = visible.filter((s) => s.group === group);
            if (!items.length) return null;
            return (
              <section key={group} aria-label={group}>
                <h2 className="mb-3 mt-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">{group}</h2>
                <div className="space-y-4">
                  {items.map((s) => (
                    <Card key={s.id}>
                      <article id={s.id} className="scroll-mt-24 lg:scroll-mt-8">
                        <h2 className="text-[20px] font-semibold tracking-tight">{s.title}</h2>
                        <div className="max-w-3xl">{s.body}</div>
                      </article>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
          <p className="px-1 pb-4 text-[12px] text-ink-3">
            Une question non couverte ? Le <Link to="/reglages" className="text-accent hover:underline">statut de l’app</Link> et
            le README du projet complètent cette page.
          </p>
        </div>
      </div>
    </>
  );
}
