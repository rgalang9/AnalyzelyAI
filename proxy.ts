import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs before the pages and endpoints that check who's signed in. A login only lasts about an
// hour, so this renews it when needed. Without it, a paying user coming back later would look
// like a guest to the server and find their lessons locked.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Renews the login if it has run out. Who someone is gets checked properly in lib/user-plan.ts.
  await supabase.auth.getSession();
  return response;
}

// The Stripe webhook isn't listed: it comes from Stripe, not from a signed-in person
export const config = {
  matcher: [
    "/learn/:path+",
    "/api/ask",
    "/api/clean",
    "/api/title",
    "/api/upload",
    "/api/stripe/checkout",
    "/api/stripe/portal",
  ],
};
