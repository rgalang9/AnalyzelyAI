import { createClient } from "@/lib/supabase/client";

// Postgres error code for "this value already exists" (a unique index blocked it)
const ALREADY_EXISTS = "23505";

// Adds an email to the Pro waitlist. Joining twice counts as success.
export async function joinWaitlist(email: string) {
  const { error } = await createClient()
    .from("waitlist")
    .insert({ email: email.trim().toLowerCase() });
  if (error && error.code !== ALREADY_EXISTS) throw error;
}
