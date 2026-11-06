"use client";

import { useEffect, useState } from "react";
import { isPlanId, type PlanId } from "@/lib/plans";
import { createClient } from "@/lib/supabase/client";
import { useUserEmail } from "./use-user-email";

// The logged-in user's plan, for what the screen shows. Guests are on Free.
// The server checks the plan again before anything paid opens, so this can't unlock anything.
export function useUserPlan() {
  const { email, loading } = useUserEmail();
  const [saved, setSaved] = useState<{ email: string; planId: PlanId } | null>(null);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    // Row Level Security means this only ever finds their own row
    createClient()
      .from("user_plans")
      .select("plan")
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Couldn't load the plan:", error.message);
        setSaved({ email, planId: isPlanId(data?.plan) ? data.plan : "free" });
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  const known = saved !== null && saved.email === email;
  return {
    planId: email && known ? saved.planId : ("free" as PlanId),
    loading: loading || (email !== null && !known),
  };
}
