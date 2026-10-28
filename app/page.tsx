import Link from "next/link";
import { ArrowRight, ChartColumn, Check, Flame, GraduationCap } from "lucide-react";
import { chunkyOrange, chunkyPurple } from "./brand";

// Guests use the app just by opening the upload page (nothing is saved for them)
const TRY_FREE_HREF = "/upload";

const FEATURES = ["Ask in plain English", "Auto charts & stats", "One-click data cleaning", "22 SQL lessons"];

// Landing page: the first screen people see at "/" (logged in or not)
export default function Home() {
  return (
    // Always light, even in dark mode, to match the brand design
    <main className="flex flex-1 flex-col bg-white text-navy">
      {/* Hero */}
      <section className="bg-linear-to-b from-white via-purple-light/40 to-purple-light/30 px-4 pb-16 pt-12 text-center sm:px-6 sm:pt-20">
        <h1 className="mx-auto max-w-4xl font-display text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
          Analyze any spreadsheet in{" "}
          <span className="box-decoration-clone bg-linear-to-b from-transparent from-60% to-purple-light to-60% px-1 text-purple">
            plain English.
          </span>
          <br />
          Learn data skills <span className="text-orange">for free.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-grey sm:text-lg">
          Upload a CSV or Excel file and ask questions. Get clear answers, charts and cleaned data in
          seconds, then practice SQL with bite-sized lessons.
        </p>

        <div className="mt-10">
          <Link href={TRY_FREE_HREF} className={chunkyPurple}>
            Try it free, no account needed
          </Link>
        </div>

        <ul className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-x-6 gap-y-3 text-sm font-medium sm:text-base">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-purple">
                <Check aria-hidden="true" className="size-3 text-white" strokeWidth={3.5} />
              </span>
              {feature}
            </li>
          ))}
        </ul>
      </section>

      {/* Navy band. White text sits between the orange and pink words (color rule). */}
      <section className="bg-navy px-4 py-5 text-white">
        <ul className="mx-auto flex max-w-5xl flex-col items-center gap-2 text-sm font-semibold sm:flex-row sm:justify-center sm:gap-0 sm:text-base">
          <li>
            <span className="text-orange">100% free</span> to start
          </li>
          <li aria-hidden="true" className="hidden px-6 text-white/40 sm:block">|</li>
          <li>
            <span className="text-pink">No sign-up</span> needed to try
          </li>
          <li aria-hidden="true" className="hidden px-6 text-white/40 sm:block">|</li>
          <li>
            Built by a <span className="text-purple-light">Wesleyan</span> data science student
          </li>
        </ul>
      </section>

      {/* Feature cards */}
      <section className="px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-center font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
          Everything you need for data, in one place
        </h2>

        <div className="mx-auto mt-12 grid max-w-6xl gap-6 md:grid-cols-3">
          <FeatureCard
            href={TRY_FREE_HREF}
            stripe="border-purple"
            iconBox="bg-purple-light text-purple"
            icon={<ChartColumn aria-hidden="true" className="size-6" />}
            title="Analyze"
            text="Drop in a spreadsheet and ask anything. Analyzely finds the trends, builds the charts and explains them simply."
            cta="Upload a file"
            ctaColor="text-purple"
          />
          <FeatureCard
            href="/learn/sql/sql-00"
            stripe="border-pink"
            iconBox="bg-pink-light text-pink"
            icon={<GraduationCap aria-hidden="true" className="size-6" />}
            title="Learn"
            text="Hands-on SQL lessons on real datasets. Five tasks per lesson, instant feedback, hints when you're stuck."
            cta="Start learning"
            ctaColor="text-pink"
          />
          <FeatureCard
            href="/daily"
            stripe="border-orange"
            iconBox="bg-orange-light text-orange"
            icon={<Flame aria-hidden="true" className="size-6" />}
            title="Daily Case"
            text="One new data puzzle every day. Solve it with SQL, Python, R or Excel, earn points and keep your streak alive."
            cta="Coming soon"
            ctaColor="text-orange-dark"
            noArrow
          />
        </div>
      </section>

      {/* Purple wave call-to-action */}
      <section>
        <svg
          viewBox="0 0 1440 80"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="block h-12 w-full sm:h-20"
        >
          <path d="M0 80 C 360 0, 720 0, 1080 40 S 1440 20, 1440 10 V 80 Z" fill="var(--color-purple)" />
        </svg>
        <div className="bg-purple px-4 pb-20 pt-6 text-center text-white sm:px-6">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
            Turn messy data into answers today
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/90 sm:text-lg">
            Students, researchers and analysts use spreadsheets every day. Analyzely makes them easy.
          </p>
          <div className="mt-10">
            <Link href={TRY_FREE_HREF} className={chunkyOrange}>
              Get started for free
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

// White card with a colored stripe on top; the whole card is one link
function FeatureCard({
  href,
  stripe,
  iconBox,
  icon,
  title,
  text,
  cta,
  ctaColor,
  noArrow = false,
}: {
  href: string;
  stripe: string;
  iconBox: string;
  icon: React.ReactNode;
  title: string;
  text: string;
  cta: string;
  ctaColor: string;
  noArrow?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl border-t-[6px] ${stripe} bg-white p-7 shadow-[0_8px_30px_rgba(36,23,79,0.08)] transition-transform hover:-translate-y-1`}
    >
      <span className={`flex size-12 items-center justify-center rounded-xl ${iconBox}`}>{icon}</span>
      <h3 className="mt-5 font-display text-2xl font-extrabold">{title}</h3>
      <p className="mt-3 flex-1 leading-7 text-grey">{text}</p>
      <span className={`mt-5 flex items-center gap-1 font-bold ${ctaColor}`}>
        {cta}
        {!noArrow && (
          <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
        )}
      </span>
    </Link>
  );
}
