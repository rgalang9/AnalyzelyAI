import "server-only";
import Stripe from "stripe";
import type { User } from "@supabase/supabase-js";
import type { PlanId } from "./plans";
import { createAdminClient } from "./supabase/server";

let stripe: Stripe | null = null;

// The Stripe connection. Made on first use, so building the site doesn't need the key.
export function getStripe() {
  if (!stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) throw new Error("STRIPE_SECRET_KEY is missing from .env.local");
    stripe = new Stripe(secretKey);
  }
  return stripe;
}

export function priceIdFor(plan: PlanId) {
  if (plan === "pro") return process.env.STRIPE_PRO_PRICE_ID;
  if (plan === "premium") return process.env.STRIPE_PREMIUM_PRICE_ID;
  return undefined;
}

function planForPrice(priceId: string): PlanId {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === process.env.STRIPE_PREMIUM_PRICE_ID) return "premium";
  // Stop rather than drop a paying customer to Free. Stripe will send the update again.
  throw new Error(`Stripe price ${priceId} doesn't match STRIPE_PRO_PRICE_ID or STRIPE_PREMIUM_PRICE_ID`);
}

// The paid plan stays while the subscription is "active" or "past_due". "past_due" means a payment
// failed and Stripe is still retrying, which is the grace period. It drops to Free once Stripe
// moves the subscription to "canceled" or "unpaid".
const PAID_STATUSES: Stripe.Subscription.Status[] = ["active", "past_due"];

// Not paid, but Stripe could still charge this subscription
const UNSETTLED_STATUSES: Stripe.Subscription.Status[] = ["unpaid", "paused"];

const OPEN_STATUSES = [...PAID_STATUSES, ...UNSETTLED_STATUSES];

// The customer's subscriptions, the one that matters first (Stripe lists newest first)
async function listSubscriptions(customerId: string) {
  const { data } = await getStripe().subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  const rank = (s: Stripe.Subscription) => {
    const position = OPEN_STATUSES.indexOf(s.status);
    return position === -1 ? OPEN_STATUSES.length : position;
  };
  return [...data].sort((a, b) => rank(a) - rank(b));
}

// True when a new Checkout could charge this customer twice
export async function hasOpenSubscription(customerId: string) {
  const [subscription] = await listSubscriptions(customerId);
  return subscription !== undefined && OPEN_STATUSES.includes(subscription.status);
}

// Copies what Stripe says about this customer into user_plans. It always asks Stripe for the
// current state, so it doesn't matter if events arrive late, twice, or out of order.
export async function syncStripeCustomer(customerId: string) {
  const [subscription] = await listSubscriptions(customerId);
  const item = subscription?.items.data[0];

  const { data, error } = await createAdminClient()
    .from("user_plans")
    .update({
      plan: subscription && PAID_STATUSES.includes(subscription.status) && item ? planForPrice(item.price.id) : "free",
      stripe_subscription_id: subscription?.id ?? null,
      subscription_status: subscription?.status ?? null,
      current_period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId)
    .select("user_id");

  if (error) throw new Error(`Couldn't save the plan: ${error.message}`);
  if (!data.length) console.error(`No user has Stripe customer ${customerId}`);
}

// The user's Stripe customer: the saved one, or a new one saved on their row (the webhook uses
// that row to find the user). A saved one can be gone from Stripe, e.g. after moving from
// test mode to live mode.
export async function customerForUser(user: User, savedCustomerId: string | null) {
  if (savedCustomerId) {
    const existing = await getStripe().customers.retrieve(savedCustomerId).catch((err) => {
      if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing") return null;
      throw err;
    });
    if (existing && !existing.deleted) return savedCustomerId;
  }

  const customer = await getStripe().customers.create({
    email: user.email,
    metadata: { supabase_user_id: user.id },
  });
  const { error } = await createAdminClient()
    .from("user_plans")
    .upsert({ user_id: user.id, stripe_customer_id: customer.id, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Couldn't save the Stripe customer: ${error.message}`);
  return customer.id;
}

// The Stripe page for cancelling, switching plans or fixing a card
export async function portalUrl(customerId: string, returnUrl: string) {
  const session = await getStripe().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  return session.url;
}
