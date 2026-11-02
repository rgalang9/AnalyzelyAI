"use client";

import { useEffect } from "react";
import { startR } from "@/lib/learn/r/runner";

// On the R lesson list: start R downloading in the background, so the first lesson opens ready.
// Also says where R comes from.
export default function RPreload() {
  useEffect(() => {
    startR().catch(() => {}); // a failure shows on the lesson page
  }, []);

  return (
    <p className="mt-8 text-xs text-zinc-500">
      R runs right in your browser, nothing to install. It&rsquo;s best on a laptop. Powered by webR and R (GPL), with dplyr,
      tidyr, ggplot2, stringr, lubridate and readr, all free and open source.
    </p>
  );
}
