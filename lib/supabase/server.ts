import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase connection for server code, acting as whoever is signed in (their login cookie).
// Row Level Security still applies, just like in the browser.
export async function createUserClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          // Pages can't set cookies. That's fine: proxy.ts already refreshed the login.
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {}
        },
      },
    }
  );
}

// Supabase connection with the secret key: skips Row Level Security, so it can change plans.
// Server only. Never use this with anything the browser chose without checking it first.
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is missing from .env.local");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
