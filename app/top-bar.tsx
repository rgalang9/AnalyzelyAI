"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEARN_LANGUAGES } from "@/lib/learn/languages";

const tabClass = (active: boolean) =>
  `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-zinc-100 text-foreground dark:bg-zinc-800"
      : "text-zinc-600 hover:bg-zinc-100 hover:text-foreground dark:text-zinc-400 dark:hover:bg-zinc-900"
  }`;

// Bar across the top of every page: "Home" (the AI analyzer) and the "Learn" menu
export default function TopBar() {
  const pathname = usePathname();
  const inLearn = pathname.startsWith("/learn");

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 border-b border-zinc-200 bg-background px-4 dark:border-zinc-800">
      <Link href="/" className={tabClass(!inLearn)}>
        Home
      </Link>
      <LearnMenu active={inLearn} />
    </header>
  );
}

// Opens on hover with a mouse, and on tap on phones and tablets
function LearnMenu({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
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
  }, [open]);

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
        Learn ▾
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
