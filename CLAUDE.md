# Brawl Dashboard : consignes de travail

Dashboard local (Node + React) qui suit un compte Brawl Stars via l'API officielle.
Voir README.md pour l'installation, et la page Documentation de l'app pour le détail fonctionnel.

## Règle : documentation toujours à jour

Toute fonctionnalité ajoutée, modifiée ou retirée DOIT être reflétée dans la même modification :

- `web/src/pages/Documentation.tsx` : section de la page concernée, méthode de calcul
  (groupe « Calculs ») si un chiffre est calculé, limites, dépannage, et une entrée dans
  « Journal des versions » ;
- la version dans `package.json` et `DOC_VERSION` (Documentation.tsx) ;
- le README si l'installation ou l'usage change.

Chaque page a un lien « Aide » (`<DocLink section="…" />`) vers sa section : garder les
identifiants de section cohérents.

## Commandes

- `npm run typecheck`, `npm test` (Vitest), `npm run build` : à lancer avant chaque commit.
- `npm run demo` : données fictives, sans clé API (base recréée à chaque lancement).
- `npm run dev` : API + Vite avec rechargement à chaud.

## Architecture

- `server/meta/` : collecte des parties classées de la communauté pour le Draft (`crawler.ts`, `matches.ts`) ;
  moteur de recommandation pur et testé dans `server/stats/draft.ts`.
- `server/` : Fastify, SQLite intégré (`node:sqlite`), collecte (`poller.ts`), clé API (`brawlstars/keys.ts`),
  statistiques pures et testées (`stats/`), assemblage des réponses (`views.ts`), routes (`routes.ts`).
- `shared/` : types (contrat serveur ↔ interface) et libellés français.
- `web/` : React + Tailwind + Recharts, design clair et sobre (pas de dégradés ni d'effets lumineux).
- Migrations de base : tableau `MIGRATIONS` dans `server/db.ts` (ne jamais modifier une migration existante,
  en ajouter une nouvelle).
- Ne jamais commiter `.env` ni `data/`.
