"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Which lessons the learner has finished, for every course (lesson ids are unique across courses:
// sql-01, py-01, xl-01, r-01). Signed-in users' progress is saved in Supabase (lesson_progress) and
// read back whenever a Learn page opens, so it survives a refresh and works on other devices.
// Guests' progress lasts until they refresh, and moves to their account if they sign up.
// Saving never holds the learner up: the lesson unlocks right away, and a failed save is only logged.
type LearnProgress = {
  completed: Set<string>; // lesson ids
  markComplete: (lessonId: string) => void;
  ready: boolean; // we know who's signed in, and their saved lessons have loaded
};

const LearnProgressContext = createContext<LearnProgress | null>(null);

// /learn/excel/xl-03 → "excel"
const courseOf = (pathname: string) => pathname.match(/^\/learn\/([^/]+)/)?.[1] ?? null;

// Next.js sometimes has to load a whole new page by itself: when a new version of the site went
// live after the tab was opened, or when a request failed. That wipes anything held only in
// memory, which used to send guests back to the lesson they'd just finished. So guests' lessons
// also go in this tab's sessionStorage (lesson id → course), and only a real refresh clears them.
// It's also how they survive the trip to sign up and pay.
const GUEST_KEY = "analyzely:guest-lessons";
type GuestLessons = Record<string, string>;

function readGuestLessons(): GuestLessons {
  try {
    const [page] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (page?.type === "reload") sessionStorage.removeItem(GUEST_KEY);
    return JSON.parse(sessionStorage.getItem(GUEST_KEY) ?? "{}");
  } catch {
    return {}; // storage is blocked: their lessons stay in memory only
  }
}

function saveGuestLessons(lessons: GuestLessons) {
  try {
    sessionStorage.setItem(GUEST_KEY, JSON.stringify(lessons));
  } catch {}
}

function clearGuestLessons() {
  try {
    sessionStorage.removeItem(GUEST_KEY);
  } catch {}
}

export function LearnProgressProvider({ children }: { children: React.ReactNode }) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null); // whose saved lessons are in `completed`
  const lastUser = useRef<string | null>(null);
  const guestLessons = useRef<GuestLessons | null>(null); // null until read from this tab
  const pathname = usePathname();
  const onLearnPage = courseOf(pathname) !== null;

  // Who's signed in (fires right away, then on log in / log out). Logging out forgets the
  // signed-in user's lessons, so the next person on this computer starts fresh.
  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null;
      // First check: bring back this tab's guest lessons, before anything says "ready"
      if (guestLessons.current === null) {
        const saved = readGuestLessons();
        guestLessons.current = saved;
        setCompleted((prev) => new Set([...prev, ...Object.keys(saved)]));
      }
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
    const supabase = createClient();

    // Just signed up or logged in: lessons they finished as a guest move to their account
    const fromGuest = Object.entries(guestLessons.current ?? {});
    if (fromGuest.length > 0) {
      guestLessons.current = {};
      clearGuestLessons();
      supabase
        .from("lesson_progress")
        .upsert(
          fromGuest.map(([lesson_id, course]) => ({ user_id: userId, course, lesson_id })),
          { onConflict: "user_id,course,lesson_id", ignoreDuplicates: true }
        )
        .then(({ error }) => {
          if (error) console.error("Couldn't save guest lessons:", error.message);
        });
    }

    supabase
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
      if (!course) return;
      if (!userId) {
        guestLessons.current = { ...guestLessons.current, [lessonId]: course };
        saveGuestLessons(guestLessons.current);
        return;
      }
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
