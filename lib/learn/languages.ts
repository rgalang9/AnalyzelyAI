// Languages in the Learn section, in release order.
// To release a language, change its `released` to true. That's the only change needed.

export type LearnLanguage = {
  slug: string; // used in the web address: /learn/<slug>
  name: string;
  released: boolean;
};

export const LEARN_LANGUAGES: LearnLanguage[] = [
  { slug: "sql", name: "SQL", released: true },
  { slug: "python", name: "Python", released: false },
  { slug: "r", name: "R", released: false },
  { slug: "stata", name: "Stata", released: false },
];

// Preview switch: languages listed in NEXT_PUBLIC_LEARN_PREVIEW (in .env.local, e.g. "python")
// open on this computer before they're released. The live site doesn't set it, so there
// they stay "Coming soon".
const PREVIEW = (process.env.NEXT_PUBLIC_LEARN_PREVIEW ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Released, or switched on for preview here
export const isOpen = (language: LearnLanguage) => language.released || PREVIEW.includes(language.slug);

// The language for a web address, or null if it doesn't exist or isn't open yet
export function findReleasedLanguage(slug: string): LearnLanguage | null {
  return LEARN_LANGUAGES.find((l) => l.slug === slug && isOpen(l)) ?? null;
}
