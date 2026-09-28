import path from 'node:path';
import { ROOT_DIR } from './paths';
import { normalizeTag } from '../shared/tags';

export interface AppConfig {
  rootDir: string;
  dataDir: string;
  webDistDir: string;
  host: string;
  port: number;
  demo: boolean;
  apiBaseUrl: string;
  apiKey: string | null;
  devEmail: string | null;
  devPassword: string | null;
  keyName: string;
  initialTags: string[];
  pollActiveSeconds: number;
  pollIdleSeconds: number;
}

function text(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function integer(value: string | undefined, fallback: number, min: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

export function loadConfig(argv: string[] = process.argv): AppConfig {
  try {
    process.loadEnvFile(path.join(ROOT_DIR, '.env'));
  } catch {
    // Pas de .env : on garde les valeurs par défaut (ou le mode démo).
  }
  const env = process.env;
  const demo = argv.includes('--demo') || env.DEMO === '1';
  const initialTags = (text(env.BS_PLAYER_TAG) ?? '')
    .split(/[,;\s]+/)
    .map((tag) => normalizeTag(tag))
    .filter((tag): tag is string => tag !== null);

  return {
    rootDir: ROOT_DIR,
    dataDir: path.resolve(ROOT_DIR, text(env.DATA_DIR) ?? 'data'),
    webDistDir: path.join(ROOT_DIR, 'web', 'dist'),
    host: text(env.HOST) ?? '0.0.0.0',
    port: integer(env.PORT, 4777, 1),
    demo,
    apiBaseUrl: (text(env.BS_API_BASE_URL) ?? 'https://api.brawlstars.com/v1').replace(/\/+$/, ''),
    apiKey: text(env.BS_API_KEY),
    devEmail: text(env.BS_DEV_EMAIL),
    devPassword: text(env.BS_DEV_PASSWORD),
    keyName: text(env.BS_KEY_NAME) ?? 'brawl-dashboard',
    initialTags,
    pollActiveSeconds: integer(env.POLL_ACTIVE_SECONDS, 120, 30),
    pollIdleSeconds: integer(env.POLL_IDLE_SECONDS, 600, 60),
  };
}
