// Journal minimaliste et lisible dans un terminal (ou dans le fichier de log launchd).

function stamp(): string {
  return new Date().toLocaleTimeString('fr-FR', { hour12: false });
}

export const log = {
  info(message: string): void {
    console.log(`${stamp()}  ${message}`);
  },
  warn(message: string): void {
    console.warn(`${stamp()}  ⚠ ${message}`);
  },
  error(message: string, error?: unknown): void {
    const detail = error instanceof Error ? ` (${error.message})` : error ? ` (${String(error)})` : '';
    console.error(`${stamp()}  ✖ ${message}${detail}`);
  },
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
