"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Ellipsis, Search } from "lucide-react";
import { deleteAnalysis, renameAnalysis, type AnalysisSummary } from "@/lib/history";
import { useDataset } from "../dataset-context";
import { useUserEmail } from "../use-user-email";
import {
  AnalysisCard,
  downloadAnalysis,
  nameOf,
  useAnalysisList,
  useOpenAnalysis,
} from "../analysis-cards";
import { ConfirmDeleteDialog, ItemMenu, RenameInput } from "../history-actions";
import { chunkyPurple } from "../brand";

const SORTS = {
  newest: { label: "Newest first", compare: (a: AnalysisSummary, b: AnalysisSummary) => b.created_at.localeCompare(a.created_at) },
  oldest: { label: "Oldest first", compare: (a: AnalysisSummary, b: AnalysisSummary) => a.created_at.localeCompare(b.created_at) },
  name: { label: "Name (A–Z)", compare: (a: AnalysisSummary, b: AnalysisSummary) => nameOf(a).localeCompare(nameOf(b)) },
};
type SortId = keyof typeof SORTS;

// "My analyses": every saved analysis as a card. Logged-in only.
export default function AnalysesPage() {
  const { email, loading } = useUserEmail();
  const router = useRouter();
  const wasLoggedIn = useRef(false);

  // Guests have nothing saved: send them to log in. Someone who logs out here is
  // left alone, since logging out already takes them to the home page.
  useEffect(() => {
    if (email) wasLoggedIn.current = true;
    else if (!loading && !wasLoggedIn.current) router.replace("/login");
  }, [loading, email, router]);

  if (!email) return null;
  return <AnalysesList email={email} />;
}

function AnalysesList({ email }: { email: string }) {
  const { analysisId, clearDataset } = useDataset();
  const { items, setItems, loaded, error, reload } = useAnalysisList(email);
  const { open, openingId, openError } = useOpenAnalysis();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortId>("newest");
  const [menu, setMenu] = useState<{ id: string; anchor: DOMRect } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AnalysisSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const closeMenu = useCallback(() => setMenu(null), []);

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    return items
      .filter((it) => !words || `${nameOf(it)} ${it.file_name}`.toLowerCase().includes(words))
      .sort(SORTS[sort].compare);
  }, [items, search, sort]);

  async function handleRename(id: string, title: string) {
    setRenamingId(null);
    setActionError("");
    setItems((list) => list.map((it) => (it.id === id ? { ...it, title } : it))); // show it right away
    try {
      await renameAnalysis(id, title);
    } catch (err) {
      console.error("Couldn't rename analysis:", err);
      setActionError("We couldn't rename that one. Please try again.");
      reload(); // bring back the real names
    }
  }

  async function handleDownload(id: string) {
    setActionError("");
    try {
      await downloadAnalysis(id);
    } catch (err) {
      console.error("Couldn't download analysis:", err);
      setActionError("We couldn't download that one. Please try again.");
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
      if (id === analysisId) clearDataset(); // it was the open one: don't keep it on screen
    } catch (err) {
      console.error("Couldn't delete analysis:", err);
      setActionError("We couldn't delete that one. Please try again.");
    } finally {
      setDeleteBusy(false);
      setDeleting(null);
    }
  }

  const problem = error || openError || actionError;

  return (
    <main className="flex flex-1 flex-col bg-white bg-linear-to-b from-purple-light/30 to-purple-light/30 px-4 py-10 text-navy sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
              My analyses
            </h1>
            <p className="mt-2 text-grey sm:text-lg">
              {loaded ? `${items.length.toLocaleString()} saved · ` : ""}click one to pick up where
              you left off
            </p>
          </div>
          {/* A plain link, like the Analyze tab, so the upload page opens fresh */}
          <a href="/upload" className={`${chunkyPurple} px-7! py-3! text-base!`}>
            + New analysis
          </a>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search your analyses</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-grey/70"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your analyses"
              className="w-full rounded-xl border-2 border-purple-light bg-white py-3 pl-11 pr-4 text-navy outline-none placeholder:text-grey/60 focus:border-purple"
            />
          </label>
          <label>
            <span className="sr-only">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortId)}
              className="w-full rounded-xl border-2 border-purple-light bg-white px-4 py-3 font-semibold text-navy outline-none focus:border-purple sm:w-auto"
            >
              {Object.entries(SORTS).map(([id, { label }]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {problem && (
          <p
            role="alert"
            className="mt-6 flex items-start gap-2 rounded-xl bg-pink-light px-4 py-3 text-sm text-navy"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-pink" />
            {problem}
          </p>
        )}
        {loaded && !error && items.length === 0 && (
          <p className="mt-8 text-grey">Nothing saved yet. Upload a file and it&rsquo;ll show up here.</p>
        )}
        {loaded && items.length > 0 && shown.length === 0 && (
          <p className="mt-8 text-grey">No analyses match &ldquo;{search}&rdquo;.</p>
        )}

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item, i) => (
            <AnalysisCard
              key={item.id}
              item={item}
              index={i}
              opening={openingId === item.id}
              disabled={openingId !== null}
              onOpen={() => open(item.id)}
              titleEditor={
                renamingId === item.id ? (
                  <RenameInput
                    initial={nameOf(item)}
                    onSave={(title) => handleRename(item.id, title)}
                    onCancel={() => setRenamingId(null)}
                  />
                ) : undefined
              }
              menu={
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
                  className="flex size-9 items-center justify-center rounded-xl bg-white text-navy shadow-sm hover:bg-purple-light"
                >
                  <Ellipsis aria-hidden="true" className="size-5" />
                </button>
              }
            />
          ))}
        </div>
      </div>

      {menu && (
        <ItemMenu
          anchor={menu.anchor}
          onClose={closeMenu}
          onRename={() => {
            setRenamingId(menu.id);
            setMenu(null);
          }}
          onDownload={() => {
            void handleDownload(menu.id);
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
    </main>
  );
}
