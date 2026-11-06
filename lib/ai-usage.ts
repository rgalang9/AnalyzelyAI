import "server-only";
import { PLANS, type PlanId } from "./plans";
import { createAdminClient } from "./supabase/server";
import { getSignedInUser, getUserPlanId } from "./user-plan";

// AI features that have a daily cap
export type DailyAiFeature = "clean" | "title";

export type AiClaim = {
  userId: string | null; // null = a guest. AI features need an account.
  allowed: boolean; // false = a guest, or they've used up their limit
  planId: PlanId;
};

const GUEST_CLAIM: AiClaim = { userId: null, allowed: false, planId: "free" };

// Counts one AI question against this month's limit, before the AI is asked
export async function claimAiQuestion(): Promise<AiClaim> {
  const user = await getSignedInUser();
  if (!user) return GUEST_CLAIM;
  const planId = await getUserPlanId(user);

  const { data, error } = await createAdminClient().rpc("claim_ai_question", {
    p_subject: user.id,
    p_limit: PLANS[planId].aiQuestionsPerMonth,
  });
  if (error) throw new Error(`Couldn't count the AI question: ${error.message}`);

  return { userId: user.id, allowed: data === true, planId };
}

// The AI didn't answer, so the question doesn't count
export async function releaseAiQuestion(userId: string) {
  const { error } = await createAdminClient().rpc("release_ai_question", { p_subject: userId });
  if (error) console.error("Couldn't give the AI question back:", error.message);
}

// Counts one AI cleaning or title against today's cap, before the AI is asked
export async function claimDailyAiUse(feature: DailyAiFeature): Promise<AiClaim> {
  const user = await getSignedInUser();
  if (!user) return GUEST_CLAIM;
  const planId = await getUserPlanId(user);

  const { data, error } = await createAdminClient().rpc("claim_ai_daily_use", {
    p_user_id: user.id,
    p_feature: feature,
    p_limit: PLANS[planId].aiDailyUses,
  });
  if (error) throw new Error(`Couldn't count the AI ${feature}: ${error.message}`);

  return { userId: user.id, allowed: data === true, planId };
}

// The AI failed, so this use doesn't count
export async function releaseDailyAiUse(userId: string, feature: DailyAiFeature) {
  const { error } = await createAdminClient().rpc("release_ai_daily_use", {
    p_user_id: userId,
    p_feature: feature,
  });
  if (error) console.error(`Couldn't give the AI ${feature} back:`, error.message);
}
