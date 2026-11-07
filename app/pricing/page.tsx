"use client";

import { useState } from "react";
import { CircleAlert, CreditCard } from "lucide-react";
import { openCustomerPortal } from "@/lib/billing";
import PlanCards from "../plan-cards";
import { useUserPlan } from "../use-user-plan";

// The Pricing page: the same three plans as the pop-up, open to everyone
export default function PricingPage() {
  const { planId, loading } = useUserPlan();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  async function handleManage() {
    setOpening(true);
    setError("");
    const result = await openCustomerPortal();
    if (result.error) setError(result.error);
    if (result.error || result.noSubscription) setOpening(false);
  }

  return (
    <main className="flex flex-1 flex-col bg-white bg-linear-to-b from-purple-light/30 to-purple-light/30 px-4 py-10 text-navy sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="text-center font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
          Pick your <span className="text-purple">plan</span>
        </h1>
        <p className="mx-auto mt-3 mb-10 max-w-xl text-center text-grey sm:text-lg">
          Start free, and upgrade when you want every lesson, more AI questions and bigger files.
        </p>

        <PlanCards currentPlan={loading ? null : planId} />

        {!loading && planId !== "free" && (
          <div className="mt-8 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => void handleManage()}
              disabled={opening}
              className="flex items-center gap-2 rounded-full border-2 border-navy px-6 py-2.5 text-sm font-bold hover:bg-purple-light/60 disabled:cursor-wait disabled:opacity-60"
            >
              <CreditCard aria-hidden="true" className="size-4 text-purple" />
              {opening ? "Opening…" : "Manage subscription"}
            </button>
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-xl bg-pink-light px-4 py-3 text-sm">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-pink" />
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
