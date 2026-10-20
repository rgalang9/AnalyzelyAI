"use client";

import { createContext, useContext, useState } from "react";

// Which lessons the learner has finished. For now this only lasts for the
// current visit (a page refresh resets it); saving progress comes in a later phase.
type LearnProgress = {
  completed: Set<string>; // lesson ids
  markComplete: (lessonId: string) => void;
};

const LearnProgressContext = createContext<LearnProgress | null>(null);

export function LearnProgressProvider({ children }: { children: React.ReactNode }) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const value: LearnProgress = {
    completed,
    markComplete: (lessonId) => setCompleted((prev) => new Set(prev).add(lessonId)),
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
