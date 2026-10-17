"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Returns the logged-in user's email, or null for guests.
// "loading" is true until we've checked, so screens don't flicker.
export function useUserEmail() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Fires right away with the current session, then again on log in / log out
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return { email, loading };
}
