// Point d'entrée. On vérifie la version de Node, puis on masque l'avertissement
// « SQLite is an experimental feature » avant de charger le reste (node:sqlite est
// chargé via un import dynamique).
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(
    `Node.js ${process.versions.node} est trop ancien : il faut Node 22.13 ou plus récent (conseillé : 24 LTS).\n` +
      'Mets-le à jour avec « brew upgrade node » ou depuis https://nodejs.org, puis relance.',
  );
  process.exit(1);
}

const emitWarning = process.emitWarning.bind(process) as (...args: unknown[]) => void;
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const message = typeof warning === 'string' ? warning : warning?.message;
  if (message?.includes('SQLite is an experimental feature')) return;
  emitWarning(warning, ...rest);
}) as typeof process.emitWarning;

await import('./main');

export {};
