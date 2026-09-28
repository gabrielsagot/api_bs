import { CircleAlert } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router';
import { Card, LoadingState } from '../components/ui';
import { usePlayers, useStatus } from '../lib/api';
import { AddPlayerForm } from './Settings';

export function WelcomePage() {
  const navigate = useNavigate();
  const players = usePlayers();
  const status = useStatus();
  if (players.isLoading) return <LoadingState />;
  if (players.data?.length) return <Navigate to="/" replace />;
  const key = status.data?.key;
  const keyProblem = key && (key.state === 'error' || key.state === 'missing');

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[520px]">
        <img src="/icon.svg" alt="" className="mb-6 size-14" />
        <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.02em]">Bienvenue</h1>
        <p className="mt-2 text-[16px] text-ink-2">
          Entre ton tag joueur : le dashboard récupère ton profil tout de suite, puis enregistre tes combats en continu
          tant qu’il tourne.
        </p>

        {keyProblem && (
          <div className="mt-6 flex items-start gap-2.5 rounded-2xl bg-warn-soft px-4 py-3 text-[13px]">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
            <div>
              <strong className="font-semibold">Clé API à configurer.</strong> {key.message}
            </div>
          </div>
        )}

        <Card className="mt-6">
          <AddPlayerForm autoFocus onAdded={(slug) => navigate(`/p/${slug}`)} />
        </Card>

        <p className="mt-6 text-[13px] text-ink-3">
          Tu pourras ajouter tes autres comptes et ceux de tes potes plus tard, dans les Réglages.
        </p>
      </div>
    </div>
  );
}
