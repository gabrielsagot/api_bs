import fs from 'node:fs';
import path from 'node:path';
import type { BackupDto } from '../shared/types';
import type { Db } from './db';
import { log } from './log';

// Sauvegardes de la base : une copie compacte et cohérente (VACUUM INTO) chaque
// semaine dans data/backups, en gardant les 8 plus récentes.

const KEEP = 8;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function listBackups(dir: string): BackupDto[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => /^brawl-.*\.sqlite$/.test(name))
      .map((name) => {
        const stat = fs.statSync(path.join(dir, name));
        return { name, createdAt: stat.mtime.toISOString(), sizeBytes: stat.size };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function createBackup(db: Db, dir: string, now = new Date()): BackupDto {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const file = path.join(dir, `brawl-${stamp}.sqlite`);
  db.run('VACUUM INTO ?', [file]);
  for (const old of listBackups(dir).slice(KEEP)) fs.rmSync(path.join(dir, old.name), { force: true });
  log.info(`Sauvegarde créée : ${path.basename(file)}`);
  return listBackups(dir).find((b) => b.name === path.basename(file))!;
}

/** Sauvegarde si la dernière date de plus d'une semaine. */
export function backupIfDue(db: Db, dir: string, now = Date.now()): void {
  const latest = listBackups(dir)[0];
  if (latest && now - Date.parse(latest.createdAt) < WEEK_MS) return;
  createBackup(db, dir, new Date(now));
}

// ── Export CSV ────────────────────────────────────────────────

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV au format « Excel français » : séparateur « ; » et BOM UTF-8. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return '﻿' + [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\n') + '\n';
}
