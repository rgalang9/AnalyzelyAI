"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert } from "lucide-react";
import { planFeatures, PLANS, type PlanId } from "@/lib/plans";

const COLUMNS: PlanId[] = ["free", "pro", "premium"];

const price = (planId: PlanId) => (PLANS[planId].priceMonthly === 0 ? "$0" : `$${PLANS[planId].priceMonthly}`);

// Pop-up comparing the three plans. Upgrade buttons open Stripe Checkout (guests sign in first).
export default function UpgradePopup({
  currentPlan,
  heading = "Unlock every lesson",
  message = "You've reached the end of the free lessons. Pick a plan to keep going.",
  onClose,
}: {
  currentPlan: PlanId;
  heading?: string;
  message?: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [opening, setOpening] = useState<PlanId | null>(null);
  const [error, setError] = useState("");

  // showModal() centers it, dims the page behind it, and lets Esc close it
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Coming back from Stripe with the browser's back button: don't stay stuck on "Opening…"
  useEffect(() => {
    const reset = () => setOpening(null);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function handleUpgrade(planId: PlanId) {
    setOpening(planId);
    setError("");
    const returnTo = window.location.pathname + window.location.search;
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, returnTo }),
      });
      const result = await response.json();
      if (result.signIn) {
        window.location.assign(`/login?next=${encodeURIComponent(returnTo)}`);
      } else if (result.url) {
        window.location.assign(result.url);
      } else {
        setError(result.error ?? "We couldn't open checkout. Please try again.");
        setOpening(null);
      }
    } catch {
      setError("We couldn't reach the server. Please check your connection and try again.");
      setOpening(null);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-3xl bg-white p-5 text-navy shadow-xl backdrop:bg-navy/50 sm:p-8"
    >
      <h2 className="text-center font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{heading}</h2>
      <p className="mx-auto mt-2 max-w-xl text-center text-grey">{message}</p>

      <div className="mt-6 grid gap-4 md:mt-8 md:grid-cols-3 md:items-stretch">
        {COLUMNS.map((planId) => {
          const plan = PLANS[planId];
          const current = planId === currentPlan;
          const highlighted = planId === "pro";
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
                    disabled={opening !== null}
                    className={`w-full rounded-full px-4 py-2.5 text-sm font-bold transition-all active:translate-y-[2px] disabled:cursor-wait disabled:opacity-60 ${
                      highlighted
                        ? "bg-purple text-white shadow-[0_4px_0_var(--color-purple-dark)] active:shadow-[0_2px_0_var(--color-purple-dark)]"
                        : "border-2 border-navy text-navy hover:bg-purple-light/60"
                    }`}
                  >
                    {opening === planId ? "Opening…" : `Upgrade to ${plan.name}`}
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

      <button
        type="button"
        onClick={() => dialogRef.current?.close()}
        className="mx-auto mt-5 block rounded-full px-5 py-2 text-sm font-semibold text-grey hover:bg-purple-light/60 hover:text-navy"
      >
        Not now
      </button>
    </dialog>
  );
}
