import { Suspense } from "react";
import { notFound } from "next/navigation";
import { findReleasedLanguage, LEARN_LANGUAGES } from "@/lib/learn/languages";
import { getLessons, summarize } from "@/lib/learn/load-lessons";
import LessonList from "../lesson-list";

// Build a page for each released language ahead of time
export function generateStaticParams() {
  return LEARN_LANGUAGES.filter((l) => l.released).map((l) => ({ language: l.slug }));
}

// The Learn page for one language, e.g. /learn/sql: the list of lessons.
// Unreleased languages (see lib/learn/languages.ts) show "page not found".
// Suspense shows a placeholder while the address is read, so clicking here feels instant.
export default function LearnLanguagePage(props: PageProps<"/learn/[language]">) {
  return (
    <Suspense fallback={<p className="px-6 py-12 text-zinc-500">Loading lessons…</p>}>
      <LessonListPage params={props.params} />
    </Suspense>
  );
}

async function LessonListPage({ params }: { params: PageProps<"/learn/[language]">["params"] }) {
  const { language } = await params;
  const lang = findReleasedLanguage(language);
  if (!lang) notFound();

  const lessons = summarize(getLessons(language));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Learn {lang.name}</h1>
      {lessons.length === 0 ? (
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">{lang.name} lessons coming very soon!</p>
      ) : (
        <LessonList language={language} lessons={lessons} />
      )}
    </main>
  );
}
