"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import AccountBar from "./account-bar";
import Sidebar from "./sidebar";

// Screens that already show the sign-up / log-in choices don't need the sidebar
const NO_SIDEBAR = ["/", "/login", "/signup"];

// Page frame: sidebar on the left, account bar + page on the right.
// On small screens the sidebar is hidden and slides in when "History" is tapped.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (NO_SIDEBAR.includes(pathname)) return children;

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex flex-1">
      {/* Dark backdrop behind the open drawer on small screens; tap to close */}
      {sidebarOpen && (
        <div
          aria-hidden="true"
          onClick={closeSidebar}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 shrink-0 border-r border-zinc-200 bg-background transition-transform md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:translate-x-0 dark:border-zinc-800 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onNavigate={closeSidebar} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AccountBar onOpenSidebar={() => setSidebarOpen(true)} />
        {children}
      </div>
    </div>
  );
}
