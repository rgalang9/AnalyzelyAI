import { Check, Lock } from "lucide-react";

// Lesson 7 in each course gets the gold "No. 7" badge. Lessons are shown counting from Lesson 0,
// so these are the lesson-07.json files: SQL, Python (both views), Excel and R.
const NO7_LESSONS = new Set(["sql-07", "py-07", "xl-07", "r-07"]);
export const isNo7Lesson = (lessonId: string) => NO7_LESSONS.has(lessonId);

// Round gold badge: gold circle, thin red ring, outer gold ring, bold white 7, a shine sweeping
// across every few seconds. Purely decorative: the lock/done status is also shown in words nearby.
// `size` in pixels. `corner` puts a small lock or check on the bottom-right.
export default function No7Badge({
  size = 40,
  corner,
  jump = false,
}: {
  size?: number;
  corner?: "locked" | "done";
  jump?: boolean;
}) {
  const ring = Math.max(2, Math.round(size * 0.07)); // outer gold ring and red ring thickness
  const cornerSize = Math.max(16, Math.round(size * 0.42));

  return (
    <span
      className={`relative inline-flex shrink-0 ${jump ? "motion-safe:animate-no7-jump" : ""}`}
      style={{ width: size, height: size }}
    >
      {/* outer gold ring */}
      <span
        className="flex size-full items-center justify-center rounded-full bg-linear-to-br from-[#ffe48a] via-gold to-[#a8770a] shadow-[0_2px_6px_rgba(168,119,10,0.35)]"
        style={{ padding: ring }}
      >
        {/* thin red ring */}
        <span className="flex size-full items-center justify-center rounded-full bg-no7-red" style={{ padding: ring }}>
          {/* gold gradient circle with the 7 and the shine */}
          <span className="relative flex size-full items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-[#ffd75e] via-gold to-[#b8860b]">
            <span
              className="font-display font-extrabold leading-none text-white [text-shadow:0_1px_2px_rgba(120,70,0,0.55)]"
              style={{ fontSize: size * 0.48 }}
            >
              7
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -translate-x-[150%] bg-linear-to-r from-transparent via-white/60 to-transparent motion-safe:animate-no7-shine"
            />
          </span>
        </span>
      </span>
      {corner && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-white ${
            corner === "done" ? "bg-green-600 text-white" : "bg-navy text-white"
          }`}
          style={{ width: cornerSize, height: cornerSize }}
        >
          {corner === "done" ? (
            <Check aria-label="Done" className="size-[60%]" strokeWidth={3} />
          ) : (
            <Lock aria-label="Locked" className="size-[58%]" strokeWidth={2.5} />
          )}
        </span>
      )}
    </span>
  );
}
