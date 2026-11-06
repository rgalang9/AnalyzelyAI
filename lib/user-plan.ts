import "server-only";
import type { User } from "@supabase/supabase-js";
import { isPlanId, type PlanId } from "./plans";
import { createUserClient } from "./supabase/server";

// Who's signed in, checked with Supabase (the login cookie alone isn't proof). Null for guests.
export async function getSignedInUser(): Promise<User | null> {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

// A user's saved plan and Stripe customer. No row yet means they're on Free.
export async function getPlanRow(user: User) {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("user_plans")
    .select("plan, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) console.error("Couldn't read the user's plan:", error.message);
  return {
    planId: (isPlanId(data?.plan) ? data.plan : "free") as PlanId,
    customerId: (data?.stripe_customer_id ?? null) as string | null,
  };
}

// The signed-in user's plan. Guests are on Free.
export async function getUserPlanId(user?: User | null): Promise<PlanId> {
  const person = user === undefined ? await getSignedInUser() : user;
  return person ? (await getPlanRow(person)).planId : "free";
}
