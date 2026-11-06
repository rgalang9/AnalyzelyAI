"use client";

import { useState } from "react";
import Link from "next/link";
import UpgradePopup from "../upgrade-popup";

// Shown instead of a lesson past the free Levels. The plans pop-up opens right away;
// closing it leaves this card, so they can reopen it or go back to the lesson list.
export default function LessonLocked({ language, langName }: { language: string; langName: string }) {
  const [showPlans, setShowPlans] = useState(true);

  return (
    <div className="mt-8 rounded-2xl border border-zinc-200 p-6">
      <p className="font-medium">🔒 This lesson is part of Pro and Premium.</p>
      <p className="mt-1 text-zinc-600">Upgrade to open every lesson in every course.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowPlans(true)}
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-80"
        >
          See plans
        </button>
        <Link
          href={`/learn/${language}`}
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-100"
        >
          All {langName} lessons
        </Link>
      </div>
      {showPlans && <UpgradePopup currentPlan="free" onClose={() => setShowPlans(false)} />}
    </div>
  );
}
