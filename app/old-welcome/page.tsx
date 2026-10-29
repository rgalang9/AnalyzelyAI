"use client"; // checks in the browser whether someone is already logged in

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUserEmail } from "../use-user-email";

// OLD welcome screen, kept here only until Step 4 of the redesign deletes it
export default function Home() {
  const { email, loading } = useUserEmail();
  const router = useRouter();

  // Already logged in? Skip the welcome screen and go straight to uploading
  useEffect(() => {
    if (email) router.replace("/upload");
  }, [email, router]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
        Analyzely
      </h1>

      <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600">
        Upload a dataset and let AI find and fix bad data — missing values,
        duplicates, and inconsistencies. Then explore it with smart charts and
        an AI chat assistant.
      </p>

      <div
        className={`mt-10 flex w-full max-w-xs flex-col gap-3 transition-opacity ${
          loading || email ? "opacity-0" : "opacity-100"
        }`}
      >
        <Link
          href="/signup"
          className="rounded-full bg-foreground px-8 py-3 text-base font-medium text-background transition-opacity hover:opacity-80"
        >
          Create an account
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-zinc-300 px-8 py-3 text-base font-medium hover:bg-zinc-100"
        >
          Log in
        </Link>
        <Link
          href="/upload"
          className="px-8 py-2 text-sm text-zinc-600 underline-offset-4 hover:text-foreground hover:underline"
        >
          Continue as guest
        </Link>
      </div>
    </main>
  );
}
