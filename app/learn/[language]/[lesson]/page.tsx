import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findReleasedLanguage, LEARN_LANGUAGES } from "@/lib/learn/languages";
import { getDatasetSql, getLessons, summarize } from "@/lib/learn/load-lessons";
import LessonGate from "../../lesson-gate";
import CodingLessonPlayer from "../../coding-lesson";
import TourLessonPlayer from "../../tour-lesson";

// Build a page for every lesson of every released language ahead of time
export function generateStaticParams() {
  return LEARN_LANGUAGES.filter((l) => l.released).flatMap((l) =>
    getLessons(l.slug).map((lesson) => ({ language: l.slug, lesson: lesson.id }))
  );
}

// One shared lesson page for every lesson, e.g. /learn/sql/sql-01.
// The lesson file decides what shows: a table tour or coding tasks.
// Suspense shows a placeholder while the address is read, so clicking here feels instant.
export default function LessonPage(props: PageProps<"/learn/[language]/[lesson]">) {
  return (
    <Suspense fallback={<p className="px-6 py-6 text-zinc-500">Loading lesson…</p>}>
      <Lesson params={props.params} />
    </Suspense>
  );
}

async function Lesson({ params }: { params: PageProps<"/learn/[language]/[lesson]">["params"] }) {
  const { language, lesson: lessonId } = await params;
  const lang = findReleasedLanguage(language);
  if (!lang) notFound();

  const lessons = getLessons(language);
  const index = lessons.findIndex((l) => l.id === lessonId);
  if (index === -1) notFound();

  const lesson = lessons[index];
  const summaries = summarize(lessons);
  const previous = summaries[index - 1] ?? null;
  const next = summaries[index + 1] ?? null;
  const setupSql = getDatasetSql(language, lesson.tables);
  const shared = { setupSql, language, nextLesson: next };

  return (
    <main className="flex w-full flex-1 flex-col px-4 py-6 lg:px-6">
      <Link href={`/learn/${language}`} className="text-sm text-zinc-500 hover:text-foreground">
        ← All {lang.name} lessons
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">
        <span className="text-zinc-500">Lesson {index}: </span>
        {lesson.title}
      </h1>

      <LessonGate language={language} previous={previous}>
        {lesson.type === "tour" ? (
          <TourLessonPlayer lesson={lesson} {...shared} />
        ) : (
          <CodingLessonPlayer lesson={lesson} {...shared} />
        )}
      </LessonGate>
    </main>
  );
}
