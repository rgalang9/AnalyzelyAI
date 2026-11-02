import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findReleasedLanguage, isOpen, LEARN_LANGUAGES, PYTHON_VIEW } from "@/lib/learn/languages";
import {
  getDatasetCsv,
  getDatasetSql,
  getExcelLessons,
  getLessons,
  getLessonSummaries,
  getNotebookLessons,
  getPythonLessons,
  getRDatasets,
  getRLessons,
  pythonSummary,
  summarize,
} from "@/lib/learn/load-lessons";
import LessonGate from "../../lesson-gate";
import LessonSidebar from "../../lesson-sidebar";
import CodingLessonPlayer from "../../coding-lesson";
import TourLessonPlayer from "../../tour-lesson";
import PythonLessonPlayer from "../../python-lesson";
import NotebookPlayer from "../../notebook-lesson";
import ExcelLessonPlayer from "../../excel-lesson";
import RLessonPlayer from "../../r-lesson";

// Build a page for every lesson of every open language ahead of time
export function generateStaticParams() {
  return LEARN_LANGUAGES.filter(isOpen).flatMap((l) =>
    getLessonSummaries(l.slug).map((lesson) => ({ language: l.slug, lesson: lesson.id }))
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
  if (language === "python") {
    return PYTHON_VIEW === "notebook" ? (
      <NotebookLessonPage lessonId={lessonId} langName={lang.name} />
    ) : (
      <PythonLesson lessonId={lessonId} langName={lang.name} />
    );
  }
  if (language === "excel") return <ExcelLessonPage lessonId={lessonId} langName={lang.name} />;
  if (language === "r") return <RLessonPage lessonId={lessonId} langName={lang.name} />;

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
        {/* The lesson list on the left, the same as in the Python course */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="self-start">
            <LessonSidebar language={language} lessons={summaries} currentId={lesson.id} />
          </div>
          <div className="min-w-0">
            {lesson.type === "tour" ? (
              <TourLessonPlayer lesson={lesson} {...shared} />
            ) : (
              <CodingLessonPlayer lesson={lesson} {...shared} />
            )}
          </div>
        </div>
      </LessonGate>
    </main>
  );
}

// Python lessons: the same page layout, with the Python player
function PythonLesson({ lessonId, langName }: { lessonId: string; langName: string }) {
  const entries = getPythonLessons();
  const index = entries.findIndex((l) => l.id === lessonId);
  if (index === -1) notFound();

  const entry = entries[index];
  const summaries = entries.map(pythonSummary);
  const previous = summaries[index - 1] ?? null;
  const next = summaries[index + 1] ?? null;

  return (
    <main className="flex w-full flex-1 flex-col px-4 py-6 lg:px-6">
      <Link href="/learn/python" className="text-sm text-zinc-500 hover:text-foreground">
        ← All {langName} lessons
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">
        <span className="text-zinc-500">Lesson {entry.number}: </span>
        {entry.title}
      </h1>

      {entry.lesson ? (
        <LessonGate language="python" previous={previous}>
          <PythonLessonPlayer
            lesson={entry.lesson}
            files={getDatasetCsv(entry.lesson.datasets)}
            language="python"
            lessons={summaries}
            nextLesson={next}
          />
        </LessonGate>
      ) : (
        // The lesson file has a mistake: say so here, so the rest of the course still works
        <div role="alert" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <p className="font-semibold">This lesson can&rsquo;t open yet: its lesson file has a problem.</p>
          <pre className="mt-3 whitespace-pre-wrap font-mono text-xs">{entry.problem}</pre>
        </div>
      )}
    </main>
  );
}

// Python in the notebook view (see PYTHON_VIEW in lib/learn/languages.ts)
function NotebookLessonPage({ lessonId, langName }: { lessonId: string; langName: string }) {
  const entries = getNotebookLessons();
  const index = entries.findIndex((l) => l.id === lessonId);
  if (index === -1) notFound();

  const entry = entries[index];
  const summaries = entries.map(pythonSummary);

  return (
    <main className="flex w-full flex-1 flex-col px-4 py-6 lg:px-6">
      <Link href="/learn/python" className="text-sm text-zinc-500 hover:text-foreground">
        ← All {langName} lessons
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">
        <span className="text-zinc-500">Lesson {entry.number}: </span>
        {entry.title}
      </h1>

      {entry.lesson ? (
        <LessonGate language="python" previous={summaries[index - 1] ?? null}>
          <NotebookPlayer
            key={entry.lesson.id} // a fresh notebook for each lesson
            lesson={entry.lesson}
            files={getDatasetCsv(entry.lesson.datasets)}
            language="python"
            lessons={summaries}
            nextLesson={summaries[index + 1] ?? null}
          />
        </LessonGate>
      ) : (
        <div role="alert" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <p className="font-semibold">This lesson can&rsquo;t open yet: its lesson file has a problem.</p>
          <pre className="mt-3 whitespace-pre-wrap font-mono text-xs">{entry.problem}</pre>
        </div>
      )}
    </main>
  );
}

// Excel lessons: a task panel beside a real spreadsheet
function ExcelLessonPage({ lessonId, langName }: { lessonId: string; langName: string }) {
  const lessons = getExcelLessons();
  const index = lessons.findIndex((l) => l.id === lessonId);
  if (index === -1) notFound();

  const lesson = lessons[index];
  const summaries = summarize(lessons);

  return (
    <main className="flex w-full flex-1 flex-col px-4 py-6 lg:px-6">
      <Link href="/learn/excel" className="text-sm text-zinc-500 hover:text-foreground">
        ← All {langName} lessons
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">
        <span className="text-zinc-500">Lesson {index}: </span>
        {lesson.title}
      </h1>

      <LessonGate language="excel" previous={summaries[index - 1] ?? null}>
        <ExcelLessonPlayer
          key={lesson.id} // a fresh workbook for each lesson
          lesson={lesson}
          lessons={summaries}
          nextLesson={summaries[index + 1] ?? null}
        />
      </LessonGate>
    </main>
  );
}

// R lessons: the task panel beside an RStudio-style script, console and plots
function RLessonPage({ lessonId, langName }: { lessonId: string; langName: string }) {
  const lessons = getRLessons();
  const index = lessons.findIndex((l) => l.id === lessonId);
  if (index === -1) notFound();

  const lesson = lessons[index];
  const summaries = summarize(lessons);

  return (
    <main className="flex w-full flex-1 flex-col px-4 py-6 lg:px-6">
      <Link href="/learn/r" className="text-sm text-zinc-500 hover:text-foreground">
        ← All {langName} lessons
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">
        <span className="text-zinc-500">Lesson {index}: </span>
        {lesson.title}
      </h1>

      <LessonGate language="r" previous={summaries[index - 1] ?? null}>
        <RLessonPlayer
          key={lesson.id} // a fresh R session for each lesson
          lesson={lesson}
          datasets={getRDatasets(lesson.datasets)}
          lessons={summaries}
          nextLesson={summaries[index + 1] ?? null}
        />
      </LessonGate>
    </main>
  );
}
