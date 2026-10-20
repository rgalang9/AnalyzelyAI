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

// The language for a web address, or null if it doesn't exist or isn't released yet
export function findReleasedLanguage(slug: string): LearnLanguage | null {
  return LEARN_LANGUAGES.find((l) => l.slug === slug && l.released) ?? null;
}
