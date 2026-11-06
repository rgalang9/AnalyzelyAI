// Server endpoint at GET /api/stripe/return: where Stripe sends people after they pay.
// It asks Stripe for the result, so their plan is ready when the page opens, even if the webhook
// is a few seconds behind. The address only says which checkout to look up; the browser can't
// set a plan here, because everything saved comes from Stripe.

import { safePath } from "@/lib/safe-path";
import { getStripe, syncStripeCustomer } from "@/lib/stripe";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  let returnTo = "/upload";

  if (sessionId) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      returnTo = safePath(session.metadata?.return_to);
      if (typeof session.customer === "string") await syncStripeCustomer(session.customer);
    } catch (error) {
      console.error("Couldn't look up the Stripe checkout:", error); // the webhook still updates the plan
    }
  }

  return Response.redirect(new URL(returnTo, url.origin), 303);
}
