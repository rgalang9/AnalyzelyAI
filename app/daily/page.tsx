import Link from "next/link";
import { Flame } from "lucide-react";
import { chunkyPurple } from "../brand";

// Placeholder for the Daily Case feature (no data behind it yet)
export default function DailyPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-linear-to-b from-white to-orange-light px-4 py-24 text-center text-navy sm:px-6">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-orange-light text-orange">
        <Flame aria-hidden="true" className="size-8" />
      </span>
      <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
        Daily Case
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-grey sm:text-lg">
        A new data puzzle every day. Solve it with SQL, Python, R or Excel. Coming soon.
      </p>
      <div className="mt-10">
        <Link href="/learn/sql" className={chunkyPurple}>
          Back to Learn
        </Link>
      </div>
    </main>
  );
}
