// Server endpoint at POST /api/stripe/checkout: opens Stripe Checkout for a paid plan.
// Paying only changes a plan once Stripe tells us it worked (see the webhook).

import { z } from "zod";
import { safePath } from "@/lib/safe-path";
import { customerForUser, getStripe, hasOpenSubscription, portalUrl, priceIdFor } from "@/lib/stripe";
import { getPlanRow, getSignedInUser } from "@/lib/user-plan";

const CheckoutRequestSchema = z.object({
  plan: z.enum(["pro", "premium"]),
  returnTo: z.string().max(500),
});

export async function POST(request: Request) {
  const parsed = CheckoutRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Something about that request didn't look right." }, { status: 400 });
  }

  // Guests go to sign in first
  const user = await getSignedInUser();
  if (!user) return Response.json({ signIn: true }, { status: 401 });

  const priceId = priceIdFor(parsed.data.plan);
  if (!priceId) {
    console.error(`The Stripe price id for ${parsed.data.plan} is missing from .env.local`);
    return Response.json({ error: "We couldn't open checkout. Please try again later." }, { status: 500 });
  }

  const { origin } = new URL(request.url);
  const returnTo = safePath(parsed.data.returnTo);

  try {
    const { customerId: savedCustomerId } = await getPlanRow(user);
    const customer = await customerForUser(user, savedCustomerId);

    // Already subscribed (even with a failed payment)? A second Checkout would charge them
    // twice, so they switch plans or fix their card on Stripe's own page instead.
    if (await hasOpenSubscription(customer)) {
      return Response.json({ url: await portalUrl(customer, `${origin}${returnTo}`) });
    }

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/api/stripe/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${returnTo}`,
      metadata: { return_to: returnTo },
    });
    return Response.json({ url: session.url });
  } catch (error) {
    console.error("Couldn't open Stripe Checkout:", error);
    return Response.json({ error: "We couldn't open checkout. Please try again." }, { status: 502 });
  }
}
