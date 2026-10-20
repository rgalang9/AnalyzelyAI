import { notFound } from "next/navigation";
import { findReleasedLanguage } from "@/lib/learn/languages";

// The Learn page for one language, e.g. /learn/sql.
// Unreleased languages (see lib/learn/languages.ts) show "page not found".
export default async function LearnLanguagePage(props: PageProps<"/learn/[language]">) {
  const { language } = await props.params;
  const lang = findReleasedLanguage(language);
  if (!lang) notFound();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {lang.name} lessons coming very soon!
      </h1>
    </main>
  );
}
