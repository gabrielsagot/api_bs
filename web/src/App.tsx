import type { ReactNode } from 'react';
import { createBrowserRouter, Link, Navigate, RouterProvider, useParams } from 'react-router';
import { Layout } from './components/Layout';
import { Card, EmptyState, LoadingState } from './components/ui';
import { usePlayers } from './lib/api';
import { BattlesPage } from './pages/Battles';
import { BrawlerDetailPage } from './pages/BrawlerDetail';
import { BrawlersPage } from './pages/Brawlers';
import { ComparePage } from './pages/Compare';
import { GoalsPage } from './pages/Goals';
import { HomePage } from './pages/Home';
import { RankedPage } from './pages/Ranked';
import { RotationPage } from './pages/Rotation';
import { SettingsPage } from './pages/Settings';
import { TrophiesPage } from './pages/Trophies';
import { WelcomePage } from './pages/Welcome';

function RootRedirect() {
  const { data, isLoading } = usePlayers();
  if (isLoading) return <LoadingState />;
  const primary = data?.find((p) => p.isPrimary) ?? data?.[0];
  return <Navigate to={primary ? `/p/${primary.slug}` : '/bienvenue'} replace />;
}

/** Vérifie que le joueur de l'URL est bien suivi avant d'afficher la page. */
function PlayerRoute({ children }: { children: ReactNode }) {
  const { tag } = useParams();
  const { data, isLoading } = usePlayers();
  if (isLoading) return <LoadingState />;
  if (!data?.length) return <Navigate to="/bienvenue" replace />;
  if (!data.some((p) => p.slug.toUpperCase() === tag?.toUpperCase())) {
    return (
      <Card>
        <EmptyState title="Ce joueur n’est pas suivi">
          Ajoute-le depuis les{' '}
          <Link to="/reglages" className="text-accent hover:underline">
            Réglages
          </Link>
          .
        </EmptyState>
      </Card>
    );
  }
  return children;
}

const player = (element: ReactNode) => <PlayerRoute>{element}</PlayerRoute>;

const router = createBrowserRouter([
  { path: '/bienvenue', element: <WelcomePage /> },
  {
    element: <Layout />,
    children: [
      { path: '/', element: <RootRedirect /> },
      { path: '/p/:tag', element: player(<HomePage />) },
      { path: '/p/:tag/ranked', element: player(<RankedPage />) },
      { path: '/p/:tag/trophees', element: player(<TrophiesPage />) },
      { path: '/p/:tag/combats', element: player(<BattlesPage />) },
      { path: '/p/:tag/brawlers', element: player(<BrawlersPage />) },
      { path: '/p/:tag/brawlers/:id', element: player(<BrawlerDetailPage />) },
      { path: '/p/:tag/rotation', element: player(<RotationPage />) },
      { path: '/p/:tag/objectifs', element: player(<GoalsPage />) },
      { path: '/comparer', element: <ComparePage /> },
      { path: '/reglages', element: <SettingsPage /> },
      {
        path: '*',
        element: (
          <Card>
            <EmptyState title="Page introuvable">
              <Link to="/" className="text-accent hover:underline">
                Retour à l’accueil
              </Link>
            </EmptyState>
          </Card>
        ),
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
