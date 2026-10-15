import Link from "next/link";

// Landing page: the first screen people see at "/"
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
        Analyzely
      </h1>

      <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        Upload a dataset and let AI find and fix bad data — missing values,
        duplicates, and inconsistencies. Then explore it with smart charts and
        an AI chat assistant.
      </p>

      <Link
        href="/upload"
        className="mt-10 rounded-full bg-foreground px-8 py-3 text-base font-medium text-background transition-opacity hover:opacity-80"
      >
        Get started
      </Link>
    </main>
  );
}
