"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, CircleUser } from "lucide-react";
import { LEARN_LANGUAGES } from "@/lib/learn/languages";
import { useLogOut } from "./account-bar";
import { useUserEmail } from "./use-user-email";
import Logo from "./logo";

const tabClass = (active: boolean) =>
  `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-zinc-100 text-foreground dark:bg-zinc-800"
      : "text-zinc-600 hover:bg-zinc-100 hover:text-foreground dark:text-zinc-400 dark:hover:bg-zinc-900"
  }`;

const barClass =
  "sticky top-0 flex h-14 shrink-0 items-center gap-1 border-b border-zinc-200 bg-background px-4 dark:border-zinc-800";

// Same size as the bar, shown for a moment if the page address isn't known yet
export function TopBarPlaceholder() {
  return <header className={`${barClass} z-20`} />;
}

const BRAND_BAR_PAGES = ["/", "/login", "/signup"];

// Bar across the top of every page: "Home" (the AI analyzer) and the "Learn" menu
export default function TopBar() {
  const pathname = usePathname();
  const inLearn = pathname.startsWith("/learn");
  const [menuOpen, setMenuOpen] = useState(false);

  // The landing, log-in and sign-up pages get the new brand-style bar; other pages keep this one for now
  if (BRAND_BAR_PAGES.includes(pathname))
    return <LandingTopBar pathname={pathname} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />;

  return (
    // While the Learn menu is open, the bar (and so the menu) sits above everything, sidebar
    // included. It drops back afterwards so the mobile History drawer can cover it.
    <header className={`${barClass} ${menuOpen ? "z-50" : "z-20"}`}>
      <Link href="/" className={tabClass(!inLearn)}>
        Home
      </Link>
      <LearnMenu active={inLearn} open={menuOpen} setOpen={setMenuOpen} />
    </header>
  );
}

// Brand-style tab: light purple pill when active
const landingTabClass = (active: boolean) =>
  `flex items-center gap-1 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
    active ? "bg-purple-light text-purple" : "text-navy hover:bg-purple-light/60"
  }`;

// Small chunky button with a darker bottom edge that presses down on click
const chunkyClass =
  "rounded-full px-5 py-2 text-sm font-bold transition-all active:translate-y-[2px]";

// Brand-style top bar (landing, log-in and sign-up pages): logo, tabs, and Log in / Sign up (or the account if logged in).
// On phones the tabs drop to their own row under the logo.
function LandingTopBar({
  pathname,
  menuOpen,
  setMenuOpen,
}: {
  pathname: string;
  menuOpen: boolean;
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { email, loading } = useUserEmail();
  const isHome = pathname === "/";
  const handleLogOut = useLogOut();

  return (
    // A thin line under the bar on the log-in and sign-up pages, where the page below is tinted
    <header
      className={`sticky top-0 bg-white ${isHome ? "" : "border-b border-purple-light"} ${
        menuOpen ? "z-50" : "z-20"
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Analyzely home">
          <Logo />
        </Link>

        <nav className="order-last flex w-full justify-center gap-1 md:order-none md:w-auto">
          <Link href="/upload" className={landingTabClass(isHome)}>
            Analyze
          </Link>
          <LearnMenu
            active={false}
            open={menuOpen}
            setOpen={setMenuOpen}
            buttonClassName={landingTabClass(false)}
            label={
              <>
                Learn <ChevronDown aria-hidden="true" className="size-4" />
              </>
            }
          />
          <Link href="/daily" className={landingTabClass(false)}>
            Daily Case
            <span className="rounded-full bg-pink px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              NEW
            </span>
          </Link>
        </nav>

        {/* Hidden until we know if someone is logged in, so the buttons don't flicker */}
        <div className={`flex items-center gap-2 transition-opacity ${loading ? "opacity-0" : ""}`}>
          {email ? (
            <>
              <Link
                href="/upload"
                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-navy hover:bg-purple-light/60"
              >
                <CircleUser aria-hidden="true" className="size-5 text-purple" />
                <span className="hidden max-w-48 truncate sm:inline">{email}</span>
              </Link>
              <button
                onClick={handleLogOut}
                className={`${chunkyClass} border-2 border-navy text-navy hover:bg-purple-light/60`}
              >
                Log out
              </button>
            </>
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

// Opens on hover with a mouse, and on tap on phones and tablets
function LearnMenu({
  active,
  open,
  setOpen,
  buttonClassName,
  label = "Learn ▾",
}: {
  active: boolean;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  buttonClassName?: string; // lets the landing page restyle the button
  label?: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef("mouse");

  // Close when tapping/clicking outside the menu or pressing Escape
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
  }, [open, setOpen]);

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
        className={buttonClassName ?? tabClass(active)}
      >
        {label}
      </button>

      {open && (
        // pt-2 leaves a see-through gap, so the mouse can move down without closing the menu
        <div className="absolute left-0 top-full pt-2">
          <ul className="w-56 rounded-xl border border-zinc-200 bg-background p-1.5 shadow-lg dark:border-zinc-800">
            {LEARN_LANGUAGES.map((lang) => (
              <li key={lang.slug}>
                {lang.released ? (
                  <Link
                    href={`/learn/${lang.slug}`}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    {lang.name}
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-400 dark:text-zinc-600"
                  >
                    {lang.name}
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-900">
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
