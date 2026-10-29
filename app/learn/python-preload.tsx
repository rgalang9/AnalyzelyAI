"use client";

import { useEffect } from "react";
import { preloadPython } from "@/lib/learn/python/runner";

// On the Python lesson list: start downloading Python in the background, so the first lesson
// opens ready. Also says where Python comes from.
export default function PythonPreload() {
  useEffect(() => {
    preloadPython();
  }, []);

  return (
    <p className="mt-8 text-xs text-zinc-500">
      Python runs right in your browser, nothing to install. It&rsquo;s best on a laptop. Powered by Pyodide
      (MPL-2.0), pandas and NumPy (BSD), all free and open source.
    </p>
  );
}
