"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useDataset } from "./dataset-context";
import { useUserEmail } from "./use-user-email";

// Strip across the top: a "History" button that opens the sidebar on small
// screens, plus who's logged in. Guests on big screens don't need it at all.
export default function AccountBar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { email } = useUserEmail();
  const { clearDataset } = useDataset();
  const router = useRouter();

  async function handleLogOut() {
    await createClient().auth.signOut();
    clearDataset(); // don't leave their data on screen for the next person
    router.push("/");
  }

  return (
    <div
      className={`flex items-center gap-4 border-b border-zinc-200 px-6 py-3 text-sm dark:border-zinc-800 ${
        email ? "" : "md:hidden"
      }`}
    >
      <button
        onClick={onOpenSidebar}
        className="rounded-full border border-zinc-300 px-4 py-1.5 font-medium hover:bg-zinc-100 md:hidden dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        ☰ History
      </button>

      {email && (
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden text-zinc-600 sm:inline dark:text-zinc-400">{email}</span>
          <button
            onClick={handleLogOut}
            className="rounded-full border border-zinc-300 px-4 py-1.5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
