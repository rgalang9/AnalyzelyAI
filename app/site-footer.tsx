import Link from "next/link";

// Small footer at the bottom of every page: legal links and copyright
export default function SiteFooter() {
  return (
    <footer className="border-t border-purple-light bg-white px-4 py-5 text-sm text-grey">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <Link href="/terms" className="hover:text-purple hover:underline">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-purple hover:underline">
          Privacy
        </Link>
        <span>© 2026 Analyzely</span>
      </div>
    </footer>
  );
}
