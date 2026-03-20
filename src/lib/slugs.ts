/**
 * Convert a node name to a URL-safe slug.
 * "Autonomous Weapons Proliferation" → "autonomous-weapons-proliferation"
 * "AI & Society" → "ai-and-society"
 */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
