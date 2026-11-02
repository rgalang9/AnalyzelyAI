// Goal Seek's number hunt: find x where f(x) is 0 (f = the set cell minus the target).
// f is slow (each try writes the changing cell and waits for the sheet to recalculate), so it tries
// the secant method first, which jumps straight to the answer for straight-line formulas, and falls
// back to looking for a sign change around the start and halving the gap.

const TOLERANCE = 0.0001; // the set cell must come within this of the target
const BIG = 1e15;

export async function seek(f: (x: number) => Promise<number>, start: number): Promise<number | null> {
  const ok = (y: number) => Number.isFinite(y) && Math.abs(y) < TOLERANCE;
  const f0 = await f(start);
  if (ok(f0)) return start;

  // Secant: a line through the last two tries, and where it crosses 0
  let [a, fa] = [start, f0];
  let b = start === 0 ? 1 : start * 1.01;
  let fb = await f(b);
  for (let i = 0; i < 50 && Number.isFinite(fa) && Number.isFinite(fb) && fa !== fb; i++) {
    if (ok(fb)) return b;
    const c = b - (fb * (b - a)) / (fb - fa);
    if (!Number.isFinite(c) || Math.abs(c) > BIG) break;
    [a, fa] = [b, fb];
    b = c;
    fb = await f(b);
  }
  if (ok(fb)) return b;

  // Halving: first find a value on the other side of the target, further and further from the start
  if (!Number.isFinite(f0)) return null;
  let [lo, flo] = [start, f0];
  let hi: number | null = null;
  for (let step = Math.max(1, Math.abs(start)) * 0.1, k = 0; k < 40 && hi === null; k++, step *= 2) {
    for (const x of [start + step, start - step]) {
      const fx = await f(x);
      if (Number.isFinite(fx) && Math.sign(fx) !== Math.sign(f0)) {
        hi = x;
        break;
      }
    }
  }
  if (hi === null) return null;
  let far: number = hi;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + far) / 2;
    const fm = await f(mid);
    if (!Number.isFinite(fm)) return null;
    if (ok(fm)) return mid;
    if (Math.sign(fm) === Math.sign(flo)) [lo, flo] = [mid, fm];
    else far = mid;
  }
  return null;
}
