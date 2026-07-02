/**
 * Slug helpers. Kept tiny and pure so both the service and tests can rely on
 * deterministic behavior.
 */

/** Convert arbitrary text to a kebab-case slug. Returns "" when no usable ascii. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

/** Build a fallback-safe slug: slugify(title) or a short id-derived stub. */
export function deriveSlug(title: string, id: string): string {
  const base = slugify(title);
  return base.length > 0 ? base : `content-${id.slice(0, 8)}`;
}
