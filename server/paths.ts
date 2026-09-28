import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Racine du projet, quel que soit le dossier depuis lequel l'app est lancée. */
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
