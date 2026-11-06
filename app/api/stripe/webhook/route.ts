// Server endpoint at POST /api/stripe/webhook: Stripe calls this when a subscription changes.
// This is the one place plans change, and the signature proves the message came from Stripe.

import type Stripe from "stripe";
import { getStripe, syncStripeCustomer } from "@/lib/stripe";

// Which customer an event is about, for the events we care about
function customerOf(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": // subscribed
    case "customer.subscription.created":
    case "customer.subscription.updated": // changed plans, or a payment failed or recovered
    case "customer.subscription.deleted": // cancelled
    case "invoice.payment_failed": {
      const { customer } = event.data.object;
      return typeof customer === "string" ? customer : (customer?.id ?? null);
    }
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) console.error("STRIPE_WEBHOOK_SECRET is missing from .env.local");
  if (!signature || !secret) {
    return Response.json({ error: "Can't verify this request." }, { status: 400 });
  }

  // The signature covers the exact text Stripe sent, so read it before anything parses it
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    console.error("Stripe webhook signature check failed:", error);
    return Response.json({ error: "Can't verify this request." }, { status: 400 });
  }

  const customerId = customerOf(event);
  if (customerId) {
    try {
      await syncStripeCustomer(customerId);
    } catch (error) {
      console.error(`Couldn't handle Stripe event ${event.type}:`, error);
      return Response.json({ error: "Couldn't save that update." }, { status: 500 }); // Stripe tries again
    }
  }

  return Response.json({ received: true });
}
