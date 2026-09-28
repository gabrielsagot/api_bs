import fs from 'node:fs/promises';
import path from 'node:path';

// Proxy + cache disque des images du CDN Brawlify (l'API officielle n'en fournit aucune).
// Chaque image n'est téléchargée qu'une fois ; ensuite elle est servie localement,
// y compris sur le téléphone.

const CDN = 'https://cdn.brawlify.com';

const SOURCES: Record<string, (id: string) => string> = {
  brawler: (id) => `${CDN}/brawlers/borderless/${id}.png`,
  map: (id) => `${CDN}/maps/regular/${id}.png`,
  icon: (id) => `${CDN}/profile-icons/regular/${id}.png`,
  gadget: (id) => `${CDN}/gadgets/borderless/${id}.png`,
  starpower: (id) => `${CDN}/star-powers/borderless/${id}.png`,
  gear: (id) => `${CDN}/gears/regular/${id}.png`,
  rank: (id) => `${CDN}/ranked/tiered/${id}.png`,
  mode: (id) => `${CDN}/game-modes/regular/${id}.png`,
};

const MISSING_RETRY_MS = 24 * 60 * 60 * 1000;

export type ImageResult = { status: 200; body: Buffer } | { status: 404 };

export class ImageCache {
  private readonly pending = new Map<string, Promise<ImageResult>>();

  constructor(
    private readonly dir: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static isValid(kind: string, id: string): boolean {
    return kind in SOURCES && /^\d{1,12}$/.test(id);
  }

  get(kind: string, id: string): Promise<ImageResult> {
    const key = `${kind}/${id}`;
    let task = this.pending.get(key);
    if (!task) {
      task = this.load(kind, id).finally(() => this.pending.delete(key));
      this.pending.set(key, task);
    }
    return task;
  }

  private async load(kind: string, id: string): Promise<ImageResult> {
    const file = path.join(this.dir, kind, `${id}.png`);
    const missingMarker = `${file}.missing`;
    try {
      return { status: 200, body: await fs.readFile(file) };
    } catch {
      // pas encore en cache
    }
    try {
      const marker = await fs.stat(missingMarker);
      if (Date.now() - marker.mtimeMs < MISSING_RETRY_MS) return { status: 404 };
    } catch {
      // pas de marqueur : on tente le téléchargement
    }
    try {
      const response = await this.fetchImpl(SOURCES[kind](id), { signal: AbortSignal.timeout(10_000) });
      await fs.mkdir(path.dirname(file), { recursive: true });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
        if (response.status === 404) await fs.writeFile(missingMarker, '');
        return { status: 404 };
      }
      const body = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(file, body);
      return { status: 200, body };
    } catch {
      return { status: 404 };
    }
  }
}
