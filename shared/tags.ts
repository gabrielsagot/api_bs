/** Caractères autorisés dans un tag Supercell (pas de O, de I ni de voyelles). */
const TAG_ALPHABET = /^[0289PYLQGRJCUV]+$/;

/**
 * Normalise une saisie utilisateur : '#2pp', ' 2PP ', '2PO' (O tapé à la place de 0) → '#2PP'.
 * Renvoie null si le tag ne peut pas être valide.
 */
export function normalizeTag(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/^#+/, '')
    .replace(/\s+/g, '')
    .replace(/O/g, '0');
  if (cleaned.length < 3 || cleaned.length > 14 || !TAG_ALPHABET.test(cleaned)) return null;
  return `#${cleaned}`;
}

/** '#2PP' → '2PP' : forme utilisée dans les URLs de l'app. */
export function tagSlug(tag: string): string {
  return tag.replace(/^#/, '');
}

export function sameTag(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return tagSlug(a).toUpperCase() === tagSlug(b).toUpperCase();
}
