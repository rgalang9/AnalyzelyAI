import { createBrowserClient } from "@supabase/ssr";

// Supabase connection used in the browser (sign up, log in, log out).
// Calling this many times is fine: it always hands back the same client.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
