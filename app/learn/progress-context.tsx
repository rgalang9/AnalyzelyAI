"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Which lessons the learner has finished, for every course (lesson ids are unique across courses:
// sql-01, py-01, xl-01, r-01). Signed-in users' progress is saved in Supabase (lesson_progress) and
// read back whenever a Learn page opens, so it survives a refresh and works on other devices.
// Guests' progress only lasts until the page is refreshed. Saving never holds the learner up:
// the lesson unlocks right away, and a failed save is only logged.
type LearnProgress = {
  completed: Set<string>; // lesson ids
  markComplete: (lessonId: string) => void;
  ready: boolean; // we know who's signed in, and their saved lessons have loaded
};

const LearnProgressContext = createContext<LearnProgress | null>(null);

// /learn/excel/xl-03 → "excel"
const courseOf = (pathname: string) => pathname.match(/^\/learn\/([^/]+)/)?.[1] ?? null;

export function LearnProgressProvider({ children }: { children: React.ReactNode }) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null); // whose saved lessons are in `completed`
  const lastUser = useRef<string | null>(null);
  const pathname = usePathname();
  const onLearnPage = courseOf(pathname) !== null;

  // Who's signed in (fires right away, then on log in / log out). Logging out forgets the
  // signed-in user's lessons, so the next person on this computer starts fresh.
  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null;
      if (lastUser.current && lastUser.current !== id) {
        setCompleted(new Set());
        setLoadedFor(null);
      }
      lastUser.current = id;
      setUserId(id);
      setAuthChecked(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // A Learn page opened (or the user signed in): read their saved lessons and unlock them
  useEffect(() => {
    if (!userId || !onLearnPage) return;
    let cancelled = false;
    createClient()
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadedFor(userId); // even on an error: the lessons finished this visit still unlock
        if (error) return console.error("Couldn't load lesson progress:", error.message);
        setCompleted((prev) => new Set([...prev, ...(data ?? []).map((row) => row.lesson_id as string)]));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, onLearnPage, pathname]);

  const value: LearnProgress = {
    completed,
    ready: authChecked && (!userId || loadedFor === userId),
    markComplete: (lessonId) => {
      setCompleted((prev) => new Set(prev).add(lessonId));
      const course = courseOf(pathname);
      if (!userId || !course) return; // guests: this visit only
      createClient()
        .from("lesson_progress")
        .upsert(
          { user_id: userId, course, lesson_id: lessonId, completed_at: new Date().toISOString() },
          { onConflict: "user_id,course,lesson_id", ignoreDuplicates: true } // already saved: leave it
        )
        .then(({ error }) => {
          if (error) console.error(`Couldn't save progress for ${course}/${lessonId}:`, error.message);
        });
    },
  };

  return <LearnProgressContext.Provider value={value}>{children}</LearnProgressContext.Provider>;
}

export function useLearnProgress() {
  const value = useContext(LearnProgressContext);
  if (!value) throw new Error("useLearnProgress must be used inside LearnProgressProvider");
  return value;
}

// A lesson is open once the lesson before it is finished (the first one is always open)
export function useIsUnlocked(previousLessonId: string | null) {
  const { completed } = useLearnProgress();
  return previousLessonId === null || completed.has(previousLessonId);
}
