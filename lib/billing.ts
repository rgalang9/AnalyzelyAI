import type { PlanId } from "./plans";

const JSON_HEADERS = { "Content-Type": "application/json" };
const currentPath = () => window.location.pathname + window.location.search;

// Browser side of paying. Plans only ever change on the server, once Stripe confirms.

// Opens Stripe Checkout for a plan. Guests go to sign up first, then on to Checkout.
// Returns an error message, or null when the browser is on its way to the next page.
export async function startCheckout(plan: PlanId, returnTo = currentPath()): Promise<string | null> {
  try {
    const response = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ plan, returnTo }),
    });
    const result = await response.json();
    if (result.signIn) {
      window.location.assign(`/signup?plan=${plan}&next=${encodeURIComponent(returnTo)}`);
      return null;
    }
    if (result.url) {
      window.location.assign(result.url);
      return null;
    }
    return result.error ?? "We couldn't open checkout. Please try again.";
  } catch {
    return "We couldn't reach the server. Please check your connection and try again.";
  }
}

// Opens Stripe's page for cancelling or switching plans.
// `noSubscription` means they've never subscribed, so there's nothing to manage yet.
export async function openCustomerPortal(): Promise<{ noSubscription?: boolean; error?: string }> {
  try {
    const response = await fetch("/api/stripe/portal", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ returnTo: currentPath() }),
    });
    const result = await response.json();
    if (result.url) {
      window.location.assign(result.url);
      return {};
    }
    if (result.noSubscription) return { noSubscription: true };
    return { error: result.error ?? "We couldn't open that page. Please try again." };
  } catch {
    return { error: "We couldn't reach the server. Please try again." };
  }
}
