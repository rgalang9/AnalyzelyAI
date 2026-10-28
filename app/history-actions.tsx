"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Pieces for managing a history entry in the sidebar: the "⋯" menu,
// renaming in place, and the delete confirmation.

// Small menu under the "⋯" button. It's drawn at the page level (a portal) so the
// sidebar's scroll area can't cut it off.
export function ItemMenu({
  anchor,
  onRename,
  onDelete,
  onClose,
}: {
  anchor: DOMRect; // where the "⋯" button is on screen
  onRename: () => void;
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

  const width = 160;
  const itemClass = "block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900";

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ top: anchor.bottom + 4, left: Math.max(8, anchor.right - width), width }}
      className="fixed z-50 rounded-xl border border-zinc-200 bg-background p-1.5 shadow-lg dark:border-zinc-800"
    >
      <button type="button" role="menuitem" onClick={onRename} className={itemClass}>
        Rename
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onDelete}
        className={`${itemClass} text-red-600 dark:text-red-400`}
      >
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
      className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-background px-2 py-1.5 text-sm font-medium outline-none focus:border-foreground dark:border-zinc-700"
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
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-background p-6 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <h2 className="text-lg font-semibold">Delete this analysis? This can&rsquo;t be undone.</h2>
      <p className="mt-2 truncate text-sm text-zinc-600 dark:text-zinc-400" title={name}>
        &ldquo;{name}&rdquo; and its questions, answers, and fixes will be removed.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </dialog>
  );
}
