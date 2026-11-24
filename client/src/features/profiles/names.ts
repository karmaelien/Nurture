/** One or two initials: "Rose Alvarez" becomes "RA", "Rose" becomes "R". */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
}

/** What to call someone in a sentence: their preferred name, else their first name. */
export function shortName(name: string, preferredName?: string | null) {
  return preferredName?.trim() || name.trim().split(/\s+/)[0] || 'This person'
}

/** The name to lead with: "Grandma Rose" when set, else "Rose Alvarez". */
export const displayName = (person: { name: string; preferredName: string | null }) =>
  person.preferredName ?? person.name
