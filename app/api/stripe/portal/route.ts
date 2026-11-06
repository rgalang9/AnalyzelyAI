// Server endpoint at POST /api/stripe/portal: opens Stripe's page for cancelling or switching plans.

import { safePath } from "@/lib/safe-path";
import { portalUrl } from "@/lib/stripe";
import { getPlanRow, getSignedInUser } from "@/lib/user-plan";

export async function POST(request: Request) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ signIn: true }, { status: 401 });

  // Never subscribed: nothing to manage yet
  const { customerId } = await getPlanRow(user);
  if (!customerId) return Response.json({ noSubscription: true }, { status: 404 });

  const body = await request.json().catch(() => null);
  const { origin } = new URL(request.url);

  try {
    return Response.json({ url: await portalUrl(customerId, `${origin}${safePath(body?.returnTo)}`) });
  } catch (error) {
    console.error("Couldn't open the Stripe Customer Portal:", error);
    return Response.json({ error: "We couldn't open that page. Please try again." }, { status: 502 });
  }
}
