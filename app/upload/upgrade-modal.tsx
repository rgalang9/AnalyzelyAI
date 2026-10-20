"use client";

import { useEffect, useRef, useState } from "react";
import { PLANS, type LimitProblem } from "@/lib/plans";
import { joinWaitlist } from "@/lib/waitlist";

// Pop-up shown when a file is over the free limit, with a Pro waitlist sign-up
export function UpgradeModal({
  problem,
  onClose,
}: {
  problem: LimitProblem;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");

  // showModal() centers it, dims the page behind it, and lets Esc close it
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  async function handleJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoining(true);
    setError("");
    try {
      await joinWaitlist(email);
      setJoined(true);
    } catch (err) {
      console.error("Couldn't join waitlist:", err);
      setError("Something went wrong. Please try again.");
    }
    setJoining(false);
  }

  const pro = PLANS.pro;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-background p-6 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <h2 className="text-2xl font-bold tracking-tight">
        This file&apos;s a big one! 📊
      </h2>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        {problem.detail}, and the {problem.planName} limit is {problem.limit}.
      </p>
      <p className="mt-4 font-medium">
        Analyzely {pro.name} — bigger files, ${pro.priceMonthly}/month. Coming
        soon!
      </p>

      {joined ? (
        <p role="status" className="mt-4 text-sm text-green-700 dark:text-green-400">
          You&apos;re on the list! We&apos;ll let you know when {pro.name} launches.
        </p>
      ) : (
        <form onSubmit={handleJoin} className="mt-4 flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-zinc-300 p-3 text-sm dark:border-zinc-700 dark:bg-transparent"
          />
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={joining}
            className="rounded-full bg-foreground px-6 py-3 font-medium text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {joining ? "Joining..." : "Join the waitlist"}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={() => dialogRef.current?.close()}
        className="mt-3 w-full rounded-full border border-zinc-300 px-6 py-3 font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Try a smaller file
      </button>
    </dialog>
  );
}
