"use client";

import { useRouter } from "next/navigation";
import { canOpenLevel } from "@/lib/plans";
import UpgradePopup from "../upgrade-popup";
import { useLearnProgress } from "./progress-context";

// Shown instead of a lesson the plan doesn't include. The plans pop-up opens right away, and
// closing it takes them back to the last free lesson they finished (or the course page).
export default function LessonLocked({
  language,
  lessons,
}: {
  language: string;
  lessons: { id: string; level: number }[];
}) {
  const router = useRouter();
  const { completed } = useLearnProgress();

  function goBack() {
    const finished = lessons.filter((l) => canOpenLevel("free", l.level) && completed.has(l.id)).at(-1);
    router.replace(finished ? `/learn/${language}/${finished.id}` : `/learn/${language}`);
  }

  return (
    <div className="mt-8 rounded-2xl border border-zinc-200 p-6">
      <p className="font-medium">🔒 This lesson is part of Pro and Premium.</p>
      <p className="mt-1 text-zinc-600">Upgrade to open every lesson in every course.</p>
      <UpgradePopup currentPlan="free" onClose={goBack} />
    </div>
  );
}
