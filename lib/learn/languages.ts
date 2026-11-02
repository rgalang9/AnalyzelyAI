// Languages in the Learn section, in release order.
// To release a language, change its `released` to true. That's the only change needed.

export type LearnLanguage = {
  slug: string; // used in the web address: /learn/<slug>
  name: string;
  released: boolean;
};

export const LEARN_LANGUAGES: LearnLanguage[] = [
  { slug: "sql", name: "SQL", released: true },
  { slug: "python", name: "Python", released: true },
  { slug: "excel", name: "Excel", released: false }, // the Excel released switch
  { slug: "r", name: "R", released: false },
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

// Python has two lesson views: "lessons" (one task at a time, lib/learn/python/lessons/) and
// "notebook" (one scrolling notebook per lesson, lib/learn/python/notebook/).
// The live site uses PYTHON_VIEW_LIVE. To try the other view on this computer, set
// NEXT_PUBLIC_PYTHON_VIEW in .env.local (it's set to "notebook" there).
export type PythonView = "lessons" | "notebook";
const PYTHON_VIEW_LIVE: PythonView = "lessons";
export const PYTHON_VIEW: PythonView =
  process.env.NEXT_PUBLIC_PYTHON_VIEW === "notebook" || process.env.NEXT_PUBLIC_PYTHON_VIEW === "lessons"
    ? process.env.NEXT_PUBLIC_PYTHON_VIEW
    : PYTHON_VIEW_LIVE;
