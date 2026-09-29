import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BattleListResponse,
  BattleStatsResponse,
  BrawlerDetailResponse,
  CollectionResponse,
  CompareResponse,
  CreateGoalInput,
  BackupDto,
  DraftOverviewResponse,
  DraftRecommendResponse,
  GoalDto,
  LiveSessionResponse,
  OverviewResponse,
  PlayerListItem,
  RankedResponse,
  RotationResponse,
  StatusDto,
  TrophiesResponse,
} from '../../../shared/types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      'x-requested-with': 'brawl-dashboard',
      ...init.headers,
    },
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new ApiError(response.status, data?.error ?? `Erreur ${response.status}`);
  return data as T;
}

const LIVE = 60_000;

function toQuery(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const useStatus = () =>
  useQuery({ queryKey: ['status'], queryFn: () => api<StatusDto>('/status'), refetchInterval: 20_000 });

export const usePlayers = () =>
  useQuery({ queryKey: ['players'], queryFn: () => api<PlayerListItem[]>('/players'), refetchInterval: LIVE });

function usePlayerData<T>(slug: string, path: string, params: Record<string, string | number | null | undefined> = {}) {
  const query = toQuery(params);
  return useQuery({
    queryKey: ['player', slug, path, query],
    queryFn: () => api<T>(`/players/${slug}${path}${query}`),
    refetchInterval: LIVE,
    placeholderData: keepPreviousData,
  });
}

export const useOverview = (slug: string) => usePlayerData<OverviewResponse>(slug, '/overview');
export const useDraft = (slug: string) => usePlayerData<DraftOverviewResponse>(slug, '/draft');
/** Recommandations du Draft ; `params` null tant qu'aucune map n'est choisie. */
export const useDraftRecommend = (slug: string, params: Record<string, string | number> | null) => {
  const query = toQuery(params ?? {});
  return useQuery({
    queryKey: ['player', slug, '/draft/recommend', query],
    queryFn: () => api<DraftRecommendResponse>(`/players/${slug}/draft/recommend${query}`),
    enabled: params !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
};
export const useRanked = (slug: string, period: string, queue: string) =>
  usePlayerData<RankedResponse>(slug, '/ranked', { period, queue });
export const useTrophies = (slug: string, period: string) => usePlayerData<TrophiesResponse>(slug, '/trophies', { period });
export const useBattleStats = (slug: string, filters: Record<string, string | null>) =>
  usePlayerData<BattleStatsResponse>(slug, '/battles/stats', filters);
export const useBattleList = (slug: string, filters: Record<string, string | null>, limit: number) =>
  usePlayerData<BattleListResponse>(slug, '/battles', { ...filters, limit });
export const useCollection = (slug: string) => usePlayerData<CollectionResponse>(slug, '/brawlers');
export const useBrawler = (slug: string, id: string) => usePlayerData<BrawlerDetailResponse>(slug, `/brawlers/${id}`);
export const useRotation = (slug: string) => usePlayerData<RotationResponse>(slug, '/rotation');
export const useGoals = (slug: string) => usePlayerData<GoalDto[]>(slug, '/goals');
export const useLiveSession = (slug: string) =>
  useQuery({
    queryKey: ['player', slug, '/session'],
    queryFn: () => api<LiveSessionResponse>(`/players/${slug}/session`),
    refetchInterval: 20_000,
    placeholderData: keepPreviousData,
  });
export const useBackups = () => useQuery({ queryKey: ['backups'], queryFn: () => api<BackupDto[]>('/backups') });

export const useCompare = (tags: string[]) =>
  useQuery({
    queryKey: ['compare', tags.join(',')],
    queryFn: () => api<CompareResponse>(`/compare${toQuery({ tags: tags.join(',') })}`),
    refetchInterval: LIVE,
    placeholderData: keepPreviousData,
  });

/** Mutation qui rafraîchit toutes les données une fois terminée. */
function useAction<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: run, onSuccess: () => client.invalidateQueries() });
}

export const useRefresh = () => useAction(() => api<{ ok: boolean }>('/refresh', { method: 'POST' }));
export const useRenewKey = () => useAction(() => api('/key/renew', { method: 'POST' }));
export const useAddPlayer = () =>
  useAction((tag: string) => api<PlayerListItem>('/players', { method: 'POST', body: JSON.stringify({ tag }) }));
export const useRemovePlayer = () => useAction((slug: string) => api(`/players/${slug}`, { method: 'DELETE' }));
export const useSetPrimary = () => useAction((slug: string) => api(`/players/${slug}/primary`, { method: 'POST' }));
export const useSetNameStyle = () =>
  useAction(({ slug, style }: { slug: string; style: string | null }) =>
    api(`/players/${slug}/name-style`, { method: 'PUT', body: JSON.stringify({ style }) }),
  );
export const useCreateGoal = (slug: string) =>
  useAction((input: CreateGoalInput) => api<GoalDto>(`/players/${slug}/goals`, { method: 'POST', body: JSON.stringify(input) }));
export const useDeleteGoal = () => useAction((id: number) => api(`/goals/${id}`, { method: 'DELETE' }));
export const useCreateBackup = () => useAction(() => api<BackupDto>('/backups', { method: 'POST' }));
export const exportUrl = (slug: string, file: 'combats.csv' | 'progression.csv') => `/api/players/${slug}/export/${file}`;

export const imageUrl = (kind: 'brawler' | 'icon' | 'map' | 'gadget' | 'starpower' | 'gear' | 'rank' | 'mode', id: number) =>
  `/api/img/${kind}/${id}.png`;
