"use client"; // runs in the browser so we can handle typing and clicks

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, CircleCheck } from "lucide-react";
import { startCheckout } from "@/lib/billing";
import { PLANS, type PlanId } from "@/lib/plans";
import { safePath } from "@/lib/safe-path";
import { createClient } from "@/lib/supabase/client";
import { chunkyPurple } from "./brand";

const inputClass =
  "w-full rounded-xl border-2 border-purple-light bg-white px-4 py-3 text-navy outline-none transition-colors placeholder:text-grey/60 focus:border-purple";

// One form shared by the "Create an account" and "Log in" screens
export default function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const isSignup = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Sent here from somewhere? Go back there after logging in.
  const next = searchParams.get("next");
  // Sent here by an Upgrade button? Go straight on to Stripe Checkout for that plan.
  const planParam = searchParams.get("plan");
  const plan: PlanId | null = planParam === "pro" || planParam === "premium" ? planParam : null;

  // Keeps those two when switching between Log in and Sign up
  const query = new URLSearchParams();
  if (next) query.set("next", safePath(next));
  if (plan) query.set("plan", plan);
  const queryText = query.size > 0 ? `?${query}` : "";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { data, error } = isSignup
      ? await supabase.auth.signUp({
          email,
          password,
          // The confirmation link brings them back to log in, with their plan still picked
          options: queryText ? { emailRedirectTo: `${window.location.origin}/login${queryText}` } : undefined,
        })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }

    // Sign up with email confirmation turned on: no session until they click the link
    if (!data.session) {
      setMessage(
        "Almost there! Check your inbox for a confirmation link, then come back and log in."
      );
      setSubmitting(false);
      return;
    }

    if (plan) {
      const problem = await startCheckout(plan, safePath(next));
      if (problem) {
        setError(problem);
        setSubmitting(false);
      }
      return;
    }

    router.push(safePath(next));
  }

  return (
    // Soft light background with faint purple and orange glows
    <main className="flex flex-1 flex-col items-center justify-center bg-white bg-[radial-gradient(circle_at_15%_30%,var(--color-purple-light),transparent_45%),radial-gradient(circle_at_85%_75%,var(--color-orange-light),transparent_45%)] px-4 py-12 sm:py-20">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_12px_40px_rgba(36,23,79,0.10)]">
        {/* Brand stripe: white gaps keep the pink and orange from touching */}
        <div aria-hidden="true" className="flex h-2 gap-2.5">
          <span className="flex-[3] bg-purple" />
          <span className="flex-1 bg-pink" />
          <span className="flex-1 bg-orange" />
        </div>

        <div className="px-6 pb-10 pt-8 sm:px-11">
          <Image src="/logo.png" alt="" width={74} height={64} className="mx-auto h-16 w-auto" />

          <h1 className="mt-4 text-center font-display text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">
            {isSignup ? "Create your free account" : "Welcome back!"}
          </h1>
          <p className="mt-2 text-center text-grey">
            {plan
              ? `Next, you'll check out for ${PLANS[plan].name}.`
              : isSignup
                ? "Ask AI questions and save your analyses and lesson progress."
                : "Log in to ask AI questions and see your saved analyses."}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <label className="flex flex-col gap-2 text-sm font-semibold text-navy">
              Email
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} font-normal`}
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-navy">
              Password
              <span className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-16 font-normal`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 px-4 text-sm font-semibold text-purple hover:text-purple-dark"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl bg-pink-light px-4 py-3 text-sm text-navy"
              >
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-pink" />
                {error}
              </p>
            )}
            {message && (
              <p
                role="status"
                className="flex items-start gap-2 rounded-xl bg-purple-light px-4 py-3 text-sm text-navy"
              >
                <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-purple" />
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`${chunkyPurple} mt-1 w-full disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {submitting
                ? isSignup
                  ? "Creating account..."
                  : "Logging in..."
                : isSignup
                  ? "Sign up"
                  : "Log in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-grey">
            {isSignup ? "Already have an account? " : "New here? "}
            <Link
              href={`${isSignup ? "/login" : "/signup"}${queryText}`}
              className="font-bold text-pink hover:underline"
            >
              {isSignup ? "Log in" : "Create a free account"}
            </Link>
          </p>

          <div className="my-6 flex items-center gap-3 text-xs text-grey/70">
            <span className="h-px flex-1 bg-purple-light" />
            or
            <span className="h-px flex-1 bg-purple-light" />
          </div>

          <Link
            href="/upload"
            className="block rounded-full border-2 border-navy px-6 py-3 text-center font-display font-extrabold text-navy transition-colors hover:bg-purple-light/60"
          >
            Preview a file, no account needed
          </Link>
          <p className="mt-3 text-center text-xs text-grey">Asking AI questions needs a free account.</p>
        </div>
      </div>
    </main>
  );
}
