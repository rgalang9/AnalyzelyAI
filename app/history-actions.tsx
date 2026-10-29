"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Pencil, Trash2 } from "lucide-react";

// Pieces for managing a saved analysis: the "⋯" menu,
// renaming in place, and the delete confirmation.

// Small menu under the "⋯" button. It's drawn at the page level (a portal) so
// nothing around the card can cut it off.
export function ItemMenu({
  anchor,
  onRename,
  onDownload,
  onDelete,
  onClose,
}: {
  anchor: DOMRect; // where the "⋯" button is on screen
  onRename: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on a click/tap outside, Escape, or scrolling (it would be in the wrong place)
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onClose, true);
    menuRef.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const width = 180;
  const itemClass =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-purple-light/60";

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ top: anchor.bottom + 4, left: Math.max(8, anchor.right - width), width }}
      className="fixed z-50 rounded-xl border border-purple-light bg-white p-1.5 text-navy shadow-[0_12px_40px_rgba(36,23,79,0.12)]"
    >
      <button type="button" role="menuitem" onClick={onRename} className={itemClass}>
        <Pencil aria-hidden="true" className="size-4 text-purple" />
        Rename
      </button>
      <button type="button" role="menuitem" onClick={onDownload} className={itemClass}>
        <Download aria-hidden="true" className="size-4 text-purple" />
        Download CSV
      </button>
      <button type="button" role="menuitem" onClick={onDelete} className={`${itemClass} text-pink`}>
        <Trash2 aria-hidden="true" className="size-4" />
        Delete
      </button>
    </div>,
    document.body
  );
}

// Text box that replaces the title while renaming: Enter saves, Escape cancels
export function RenameInput({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false); // so Enter/Escape and the blur that follows don't both act

  function finish(save: boolean) {
    if (finished.current) return;
    finished.current = true;
    const title = value.trim();
    if (save && title && title !== initial) onSave(title);
    else onCancel();
  }

  return (
    <input
      autoFocus
      value={value}
      maxLength={100}
      aria-label="New name"
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(false)}
      className="w-full min-w-0 rounded-lg border-2 border-purple-light bg-white px-2 py-1.5 font-display text-lg font-extrabold text-navy outline-none focus:border-purple"
    />
  );
}

// "Delete this analysis?" confirmation pop-up
export function ConfirmDeleteDialog({
  name,
  busy,
  onConfirm,
  onCancel,
}: {
  name: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault(); // Escape: close through onCancel, not on its own
        if (!busy) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-white p-6 text-navy shadow-xl backdrop:bg-navy/40"
    >
      <h2 className="font-display text-lg font-extrabold">
        Delete this analysis? This can&rsquo;t be undone.
      </h2>
      <p className="mt-2 truncate text-sm text-grey" title={name}>
        &ldquo;{name}&rdquo; and its questions, answers, and fixes will be removed.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full border-2 border-navy px-5 py-2 text-sm font-bold hover:bg-purple-light/60 disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-full bg-pink px-5 py-2 text-sm font-bold text-white hover:brightness-95 disabled:opacity-60"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </dialog>
  );
}
