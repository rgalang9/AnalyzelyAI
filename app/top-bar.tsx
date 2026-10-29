"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, FolderOpen, LogOut } from "lucide-react";
import { LEARN_LANGUAGES } from "@/lib/learn/languages";
import { createClient } from "@/lib/supabase/client";
import { useDataset } from "./dataset-context";
import { useUserEmail } from "./use-user-email";
import Logo from "./logo";

const barClass = "sticky top-0 z-40 border-b border-purple-light bg-white";

// Same spot as the bar, shown for a moment if the page address isn't known yet
export function TopBarPlaceholder() {
  return <header className={`${barClass} h-16`} />;
}

// Brand-style tab: light purple pill when active. Never wraps its text.
const tabClass = (active: boolean) =>
  `flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors lg:px-4 ${
    active ? "bg-purple-light text-purple" : "text-navy hover:bg-purple-light/60"
  }`;

// Small chunky button with a darker bottom edge that presses down on click
const chunkyClass =
  "rounded-full px-5 py-2 text-sm font-bold transition-all active:translate-y-[2px]";

// Pages that count as "Analyze" in the tabs
const ANALYZE_PAGES = ["/", "/upload", "/dataset"];

// Bar across the top of every page: logo, tabs, and Log in / Sign up (or My account).
// One line from tablet width up; only on phones do the tabs drop to their own row.
export default function TopBar() {
  const pathname = usePathname();
  const { email, loading } = useUserEmail();

  return (
    // No line under the bar on the landing page, where the hero starts right below it
    <header className={`${barClass} ${pathname === "/" ? "border-transparent" : ""}`}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 md:flex-nowrap">
        <Link href="/" aria-label="Analyzely home" className="shrink-0">
          <Logo />
        </Link>

        <nav className="order-last flex w-full justify-center gap-1 md:order-none md:w-auto md:min-w-0">
          {/* A plain link on purpose: it loads /upload fresh, like a browser refresh. An in-app
              <Link> can bring back the old upload page (old file, stuck "Uploading…") because
              Next.js keeps visited pages alive in the background. The reload also clears the
              previous dataset from memory, so the next upload is a brand-new analysis. */}
          <a href="/upload" className={tabClass(ANALYZE_PAGES.includes(pathname))}>
            Analyze
          </a>
          <LearnMenu active={pathname.startsWith("/learn")} />
          <Link href="/daily" className={tabClass(pathname === "/daily")}>
            Daily Case
            <span className="rounded-full bg-pink px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              NEW
            </span>
          </Link>
        </nav>

        {/* Hidden until we know if someone is logged in, so the buttons don't flicker */}
        <div
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap transition-opacity ${
            loading ? "opacity-0" : ""
          }`}
        >
          {email ? (
            <AccountMenu email={email} />
          ) : (
            <>
              <Link
                href="/login"
                className={`${chunkyClass} border-2 ${
                  pathname === "/login"
                    ? "border-purple bg-purple-light text-purple"
                    : "border-navy text-navy hover:bg-purple-light/60"
                }`}
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className={`${chunkyClass} bg-purple text-white shadow-[0_4px_0_var(--color-purple-dark)] active:shadow-[0_2px_0_var(--color-purple-dark)] ${
                  pathname === "/signup" ? "ring-4 ring-purple-light" : ""
                }`}
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// Closes a drop-down when tapping/clicking outside it or pressing Escape
function useCloseOnOutside(
  open: boolean,
  setOpen: (open: boolean) => void,
  boxRef: React.RefObject<HTMLDivElement | null>
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen, boxRef]);
}

const menuPanelClass =
  "w-56 rounded-xl border border-purple-light bg-white p-1.5 text-navy shadow-[0_12px_40px_rgba(36,23,79,0.12)]";
const menuItemClass =
  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-purple-light/60";

// Opens on hover with a mouse, and on tap on phones and tablets
function LearnMenu({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef("mouse");
  useCloseOnOutside(open, setOpen, boxRef);

  return (
    <div
      ref={boxRef}
      className="relative"
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onPointerDown={(e) => (lastPointer.current = e.pointerType)}
        // A mouse already opened it by hovering, so a click keeps it open; a tap toggles it
        onClick={() => setOpen((o) => (lastPointer.current === "mouse" ? true : !o))}
        className={tabClass(active)}
      >
        Learn <ChevronDown aria-hidden="true" className="size-4" />
      </button>

      {open && (
        // pt-2 leaves a see-through gap, so the mouse can move down without closing the menu
        <div className="absolute left-0 top-full pt-2">
          <ul className={menuPanelClass}>
            {LEARN_LANGUAGES.map((lang) => (
              <li key={lang.slug}>
                {lang.released ? (
                  <Link
                    href={`/learn/${lang.slug}`}
                    onClick={() => setOpen(false)}
                    className={menuItemClass}
                  >
                    {lang.name}
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-grey/60"
                  >
                    {lang.name}
                    <span className="rounded-full bg-purple-light/60 px-2 py-0.5 text-xs">
                      Coming soon
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Logs out and goes back to the home page
function useLogOut() {
  const { clearDataset } = useDataset();
  const router = useRouter();

  return async function handleLogOut() {
    await createClient().auth.signOut();
    clearDataset(); // don't leave their data on screen for the next person
    router.push("/");
  };
}

// "My account" button with a drop-down: who's logged in, My analyses, Log out
function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const handleLogOut = useLogOut();
  useCloseOnOutside(open, setOpen, boxRef);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border-2 border-purple-light py-1 pl-1 pr-3 text-sm font-bold text-navy hover:bg-purple-light/60"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-purple text-white">
          {email[0].toUpperCase()}
        </span>
        <span className="hidden sm:inline">My account</span>
        <ChevronDown aria-hidden="true" className="size-4" />
      </button>

      {open && (
        <div className={`${menuPanelClass} absolute right-0 top-full mt-2`}>
          <p className="truncate px-3 py-2 text-xs text-grey" title={email}>
            {email}
          </p>
          <Link href="/analyses" onClick={() => setOpen(false)} className={menuItemClass}>
            <FolderOpen aria-hidden="true" className="size-4 text-purple" />
            My analyses
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void handleLogOut();
            }}
            className={menuItemClass}
          >
            <LogOut aria-hidden="true" className="size-4 text-purple" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
