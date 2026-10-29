"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import type { DownloadFormat } from "@/lib/table-download";

export const DOWNLOAD_FORMATS: { format: DownloadFormat; label: string; icon: React.ReactNode }[] = [
  { format: "csv", label: "CSV (.csv)", icon: <FileText aria-hidden="true" className="size-4 text-purple" /> },
  { format: "xlsx", label: "Excel (.xlsx)", icon: <FileSpreadsheet aria-hidden="true" className="size-4 text-purple" /> },
];

// "Download ▾" with a choice of CSV or Excel. `variant` picks the big outlined button
// (page header) or a small text link (Clean tab).
export default function DownloadMenu({
  label,
  variant,
  disabled = false,
  title,
  onPick,
}: {
  label: string;
  variant: "button" | "link";
  disabled?: boolean;
  title?: string;
  onPick: (format: DownloadFormat) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  // Close on a click/tap outside or Escape
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function pick(format: DownloadFormat) {
    setOpen(false);
    setBusy(true);
    setError("");
    try {
      await onPick(format);
    } catch (err) {
      console.error("Couldn't download:", err);
      setError("We couldn't make that file. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const triggerClass =
    variant === "button"
      ? "flex items-center gap-2 rounded-full border-2 border-navy px-5 py-2.5 text-sm font-bold text-navy hover:bg-purple-light/60 disabled:cursor-not-allowed disabled:opacity-40"
      : "flex items-center gap-1 text-xs font-semibold text-purple hover:underline disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div ref={boxRef} className={`relative ${variant === "link" ? "self-center" : "shrink-0"}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || busy}
        title={title}
        className={triggerClass}
      >
        {variant === "button" && <Download aria-hidden="true" className="size-4" />}
        {busy ? "Preparing…" : label}
        <ChevronDown aria-hidden="true" className={variant === "button" ? "size-4" : "size-3.5"} />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute top-full z-30 mt-2 w-48 rounded-xl border border-purple-light bg-white p-1.5 text-navy shadow-[0_12px_40px_rgba(36,23,79,0.12)] ${
            variant === "button" ? "right-0" : "left-1/2 -translate-x-1/2"
          }`}
        >
          {DOWNLOAD_FORMATS.map((f) => (
            <button
              key={f.format}
              type="button"
              role="menuitem"
              onClick={() => void pick(f.format)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-purple-light/60"
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-pink">{error}</p>}
    </div>
  );
}
