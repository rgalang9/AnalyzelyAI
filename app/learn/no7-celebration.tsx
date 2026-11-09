"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUserEmail } from "../use-user-email";
import No7Badge, { isNo7Lesson } from "./no7-badge";

// Purely visual: the celebration after finishing Lesson 7. It never changes saving or unlocking.

// Guests: remembered only until they refresh (fine to see it again after that)
const guestSeen = new Set<string>();

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Has this person not seen the celebration for this course yet? Marks it as seen.
// Signed in: remembered in this browser. Guests (or blocked storage): until they refresh.
function firstTime(email: string | null, course: string) {
  const key = `analyzely:no7-celebrated:${email ?? "guest"}:${course}`;
  if (email) {
    try {
      if (localStorage.getItem(key)) return false;
      localStorage.setItem(key, "1");
      return true;
    } catch {
      // storage blocked: fall back to remembering it for this visit, like guests
    }
  }
  if (guestSeen.has(key)) return false;
  guestSeen.add(key);
  return true;
}

// True once, the first time this signed-in user (on this browser) finishes Lesson 7 of this course.
export function useNo7Celebration(course: string, lessonId: string) {
  const { email, loading } = useUserEmail();
  const [show, setShow] = useState(false);
  const decision = useRef<boolean | null>(null); // decided once, so a re-run doesn't change it

  useEffect(() => {
    if (loading || !isNo7Lesson(lessonId)) return;
    decision.current ??= firstTime(email, course);
    if (!decision.current) return;
    // Shown right after this check finishes (like the app's other hooks that wait on a lookup)
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setShow(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, email, course, lessonId]);

  return { show, close: () => setShow(false) };
}

// Gold, red and white paper pieces bursting in from both sides (plain canvas, no libraries)
function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const colors = ["#d9a520", "#ffd75e", "#c8102e", "#ffffff"];
    const scale = Math.min(1.2, Math.max(0.6, h / 800)); // smaller bursts on phones
    const pieces = Array.from({ length: 150 }, (_, i) => {
      const fromRight = i % 2 === 1;
      return {
        x: fromRight ? w + 10 : -10,
        y: h * (0.65 + Math.random() * 0.25),
        vx: (fromRight ? -1 : 1) * (4 + Math.random() * 8) * scale,
        vy: -(10 + Math.random() * 9) * scale,
        size: (6 + Math.random() * 6) * scale,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        color: colors[i % colors.length],
      };
    });

    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      let visible = 0;
      for (const p of pieces) {
        p.vy += 0.28 * scale;
        p.vx *= 0.985;
        p.vy *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;
        if (p.y > h + 20) continue;
        visible++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.rot * 2)); // flutter
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      }
      if (visible > 0 && now - start < 6000) frame = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, w, h);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 size-full" />;
}

// The pop-up. `next` is the normal "next lesson" link with its normal click handling,
// so Next lesson does exactly what the finish box's own button does.
export default function No7Celebration({
  next,
  onClose,
}: {
  next: { href: string; onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void } | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [motion] = useState(() => !prefersReducedMotion());

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // Clicking the dimmed area around the card closes it
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
      aria-labelledby="no7-title"
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none items-center justify-center bg-transparent p-4 backdrop:bg-navy/60 open:flex"
    >
      <div className="w-full max-w-sm rounded-3xl border-2 border-gold bg-gold-light px-6 pb-6 pt-8 text-center text-navy shadow-2xl">
        <div className="flex justify-center">
          <No7Badge size={120} jump={motion} />
        </div>
        <h2 id="no7-title" className="mt-5 font-display text-3xl font-extrabold tracking-tight">
          No. 7, done.
        </h2>
        <p className="mt-2 text-grey">You finished Lesson 7. Some numbers are worth celebrating.</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {next && (
            <Link
              href={next.href}
              onClick={(event) => {
                dialogRef.current?.close();
                next.onClick(event);
              }}
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-80"
            >
              Next lesson
            </Link>
          )}
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium hover:bg-zinc-100"
          >
            Close
          </button>
        </div>
      </div>
      {motion && <Confetti />}
    </dialog>
  );
}
