"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { PlanId } from "@/lib/plans";
import PlanCards from "./plan-cards";

// Pop-up comparing the three plans. Upgrade buttons open Stripe Checkout (guests sign up first).
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

  // showModal() centers it, dims the page behind it, and lets Esc close it
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="relative m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-3xl bg-white p-5 text-navy shadow-xl backdrop:bg-navy/50 sm:p-8"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => dialogRef.current?.close()}
        className="absolute right-3 top-3 rounded-full p-2 text-grey hover:bg-purple-light/60 hover:text-navy"
      >
        <X aria-hidden="true" className="size-5" />
      </button>

      <h2 className="px-8 text-center font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{heading}</h2>
      <p className="mx-auto mt-2 mb-6 max-w-xl text-center text-grey md:mb-8">{message}</p>

      <PlanCards currentPlan={currentPlan} />
    </dialog>
  );
}
