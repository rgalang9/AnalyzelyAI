"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteAnalysis,
  HISTORY_CHANGED,
  listAnalyses,
  loadAnalysis,
  renameAnalysis,
  type AnalysisSummary,
} from "@/lib/history";
import { ConfirmDeleteDialog, ItemMenu, RenameInput } from "./history-actions";
import { useDataset } from "./dataset-context";
import { useUserEmail } from "./use-user-email";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const nameOf = (item: AnalysisSummary) => item.title ?? item.file_name;

// Left sidebar: "New analysis" for everyone, plus saved history for logged-in users.
// `onNavigate` closes the drawer on small screens after a click.
export default function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { email, loading } = useUserEmail();
  const { analysisId, openDataset, clearDataset } = useDataset();
  const router = useRouter();
  const [items, setItems] = useState<AnalysisSummary[]>([]);
  const [listError, setListError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");
  const [version, setVersion] = useState(0); // goes up when a title changes or an entry is deleted
  const [menu, setMenu] = useState<{ id: string; anchor: DOMRect } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AnalysisSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const closeMenu = useCallback(() => setMenu(null), []);

  // Refresh the list when an AI title arrives, or after a rename or delete
  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    window.addEventListener(HISTORY_CHANGED, refresh);
    return () => window.removeEventListener(HISTORY_CHANGED, refresh);
  }, []);

  // Fetch the list when someone logs in, and again when a new analysis is saved
  useEffect(() => {
    if (!email) return;
    let ignore = false; // skip stale results if this runs again before finishing
    listAnalyses()
      .then((list) => {
        if (ignore) return;
        setItems(list);
        setListError("");
      })
      .catch((err) => {
        console.error("Couldn't load history:", err);
        if (!ignore) setListError("We couldn't load your history. Try refreshing the page.");
      });
    return () => {
      ignore = true;
    };
  }, [email, analysisId, version]);

  async function handleRename(id: string, title: string) {
    setRenamingId(null);
    setActionError("");
    setItems((list) => list.map((it) => (it.id === id ? { ...it, title } : it))); // show it right away
    try {
      await renameAnalysis(id, title);
    } catch (err) {
      console.error("Couldn't rename analysis:", err);
      setActionError("We couldn't rename that one. Please try again.");
      setVersion((v) => v + 1); // reload the real names
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    const id = deleting.id;
    setDeleteBusy(true);
    setActionError("");
    try {
      await deleteAnalysis(id);
      setItems((list) => list.filter((it) => it.id !== id));
      // Deleted the one that's open? Close it and start fresh.
      if (id === analysisId) {
        clearDataset();
        router.push("/upload");
        onNavigate();
      }
    } catch (err) {
      console.error("Couldn't delete analysis:", err);
      setActionError("We couldn't delete that one. Please try again.");
    } finally {
      setDeleteBusy(false);
      setDeleting(null);
    }
  }

  async function handleOpen(id: string) {
    setOpeningId(id);
    setOpenError("");
    try {
      const { dataset, answers, cleaning } = await loadAnalysis(id);
      openDataset(dataset, { analysisId: id, answers, cleaning });
      router.push("/dataset");
      onNavigate();
    } catch (err) {
      console.error("Couldn't open analysis:", err);
      setOpenError("We couldn't open that one. Please try again.");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <nav aria-label="Analysis history" className="flex h-full flex-col gap-6 p-4">
      {/* A plain link on purpose: it loads /upload fresh, like a browser refresh. An in-app
          <Link> can bring back the old upload page (old file, stuck "Uploading…") because
          Next.js keeps visited pages alive in the background. The reload also clears the
          previous dataset from memory, so the next upload is a brand-new analysis. */}
      <a
        href="/upload"
        className="rounded-full bg-foreground px-4 py-2.5 text-center text-sm font-medium text-background transition-opacity hover:opacity-80"
      >
        + New analysis
      </a>

      {!loading && !email && (
        <div className="rounded-2xl bg-zinc-100 p-4 text-sm dark:bg-zinc-900">
          <p className="font-medium">Log in to save your history</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            With an account, every file and question you ask is saved here so
            you can pick up where you left off.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href="/signup"
              onClick={onNavigate}
              className="rounded-full bg-foreground px-4 py-2 text-center font-medium text-background hover:opacity-80"
            >
              Create an account
            </Link>
            <Link
              href="/login"
              onClick={onNavigate}
              className="rounded-full border border-zinc-300 px-4 py-2 text-center font-medium hover:bg-zinc-200 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Log in
            </Link>
          </div>
        </div>
      )}

      {email && (
        <div className="flex min-h-0 flex-1 flex-col">
          <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Your history
          </h2>

          {listError && <p className="mt-3 px-2 text-sm text-red-600 dark:text-red-400">{listError}</p>}
          {openError && <p className="mt-3 px-2 text-sm text-red-600 dark:text-red-400">{openError}</p>}
          {actionError && <p className="mt-3 px-2 text-sm text-red-600 dark:text-red-400">{actionError}</p>}

          {!listError && items.length === 0 && (
            <p className="mt-3 px-2 text-sm text-zinc-500">
              Nothing saved yet. Upload a file and it&rsquo;ll show up here.
            </p>
          )}

          <ul className="mt-2 flex flex-col gap-1 overflow-y-auto">
            {items.map((item) => (
              <li
                key={item.id}
                className={`flex items-center gap-1 rounded-lg ${
                  item.id === analysisId ? "bg-zinc-100 dark:bg-zinc-900" : ""
                }`}
              >
                {renamingId === item.id ? (
                  <div className="flex min-w-0 flex-1 px-1 py-1.5">
                    <RenameInput
                      initial={nameOf(item)}
                      onSave={(title) => handleRename(item.id, title)}
                      onCancel={() => setRenamingId(null)}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => handleOpen(item.id)}
                    disabled={openingId !== null}
                    aria-current={item.id === analysisId ? "page" : undefined}
                    className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left hover:bg-zinc-100 disabled:cursor-wait dark:hover:bg-zinc-900"
                  >
                    <span
                      className="block truncate text-sm font-medium"
                      title={item.title ? `${item.title} (${item.file_name})` : item.file_name}
                    >
                      {nameOf(item)}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {openingId === item.id ? "Opening…" : formatDate(item.created_at)}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Options for ${nameOf(item)}`}
                  aria-haspopup="menu"
                  aria-expanded={menu?.id === item.id}
                  // Its own menu is open: don't let the menu's "clicked outside" check close it
                  // first, so this click can toggle it shut
                  onPointerDown={(e) => menu?.id === item.id && e.nativeEvent.stopPropagation()}
                  onClick={(e) => {
                    const anchor = e.currentTarget.getBoundingClientRect();
                    setMenu((m) => (m?.id === item.id ? null : { id: item.id, anchor }));
                  }}
                  className="shrink-0 rounded-lg px-2 py-2 text-zinc-500 hover:bg-zinc-200 hover:text-foreground dark:hover:bg-zinc-800"
                >
                  ⋯
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {menu && (
        <ItemMenu
          anchor={menu.anchor}
          onClose={closeMenu}
          onRename={() => {
            setRenamingId(menu.id);
            setMenu(null);
          }}
          onDelete={() => {
            setDeleting(items.find((it) => it.id === menu.id) ?? null);
            setMenu(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDeleteDialog
          name={nameOf(deleting)}
          busy={deleteBusy}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </nav>
  );
}
