// Big chunky pill buttons: a darker bottom edge makes them look pressable,
// and they sink down slightly while being clicked.
const chunky =
  "inline-flex items-center justify-center rounded-full px-8 py-4 font-display text-lg font-extrabold transition-all active:translate-y-1 sm:px-12 sm:text-xl";

export const chunkyPurple = `${chunky} bg-purple text-white shadow-[0_6px_0_var(--color-purple-dark)] hover:brightness-110 active:shadow-[0_2px_0_var(--color-purple-dark)]`;

export const chunkyOrange = `${chunky} bg-orange text-white shadow-[0_6px_0_var(--color-orange-dark)] hover:brightness-105 active:shadow-[0_2px_0_var(--color-orange-dark)]`;
