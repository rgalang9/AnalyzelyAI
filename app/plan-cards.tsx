"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert } from "lucide-react";
import { startCheckout } from "@/lib/billing";
import { planFeatures, PLANS, type PlanId } from "@/lib/plans";

const COLUMNS: PlanId[] = ["free", "pro", "premium"];

const price = (planId: PlanId) => (PLANS[planId].priceMonthly === 0 ? "$0" : `$${PLANS[planId].priceMonthly}`);

// The three plans side by side, with Pro highlighted in the middle.
// Used by the plans pop-up and the Pricing page. currentPlan is null while it's still loading.
export default function PlanCards({ currentPlan }: { currentPlan: PlanId | null }) {
  const [opening, setOpening] = useState<PlanId | null>(null);
  const [error, setError] = useState("");

  // Coming back from Stripe with the browser's back button: don't stay stuck on "Opening…"
  useEffect(() => {
    const reset = () => setOpening(null);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function handleUpgrade(planId: PlanId) {
    setOpening(planId);
    setError("");
    const problem = await startCheckout(planId);
    if (problem) {
      setError(problem);
      setOpening(null);
    }
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3 md:items-stretch">
        {COLUMNS.map((planId) => {
          const plan = PLANS[planId];
          const current = planId === currentPlan;
          const highlighted = planId === "pro";
          const verb = planId === "pro" && currentPlan === "premium" ? "Switch to" : "Upgrade to";
          return (
            <section
              key={planId}
              aria-label={`${plan.name} plan`}
              className={`flex flex-col rounded-2xl border-2 p-5 ${
                highlighted
                  ? "border-purple bg-purple-light/40 shadow-[0_12px_40px_rgba(109,62,240,0.20)] md:-my-2 md:py-7"
                  : "border-purple-light bg-white"
              }`}
            >
              <h3 className="font-display text-xl font-extrabold">{plan.name}</h3>
              <p className="mt-2">
                <span className="font-display text-3xl font-extrabold">{price(planId)}</span>
                <span className="text-sm text-grey">/month</span>
              </p>

              <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm">
                {planFeatures(plan).map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-purple" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {current ? (
                  <p className="rounded-full bg-purple-light px-4 py-2.5 text-center text-sm font-bold text-purple">
                    Current plan
                  </p>
                ) : planId !== "free" ? (
                  <button
                    type="button"
                    onClick={() => void handleUpgrade(planId)}
                    disabled={opening !== null || currentPlan === null}
                    className={`w-full rounded-full px-4 py-2.5 text-sm font-bold transition-all active:translate-y-[2px] disabled:cursor-wait disabled:opacity-60 ${
                      highlighted
                        ? "bg-purple text-white shadow-[0_4px_0_var(--color-purple-dark)] active:shadow-[0_2px_0_var(--color-purple-dark)]"
                        : "border-2 border-navy text-navy hover:bg-purple-light/60"
                    }`}
                  >
                    {opening === planId ? "Opening…" : `${verb} ${plan.name}`}
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-pink-light px-4 py-3 text-sm">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-pink" />
          {error}
        </p>
      )}
    </>
  );
}
