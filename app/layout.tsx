import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { DatasetProvider } from "./dataset-context";
import AppShell from "./app-shell";
import { Suspense } from "react";
import TopBar, { TopBarPlaceholder } from "./top-bar";
import { LearnProgressProvider } from "./learn/progress-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Bold, rounded headings for the new brand style
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Analyzely",
  description: "AI-powered data cleaning and analysis",
  icons: { icon: "/logo.png" }, // browser tab icon
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DatasetProvider>
          <LearnProgressProvider>
            {/* These read the page address. Suspense lets Next.js build pages ahead of
                time even when part of the address (like a lesson id) isn't known yet. */}
            <Suspense fallback={<TopBarPlaceholder />}>
              <TopBar />
            </Suspense>
            <Suspense>
              <AppShell>{children}</AppShell>
            </Suspense>
          </LearnProgressProvider>
        </DatasetProvider>
      </body>
    </html>
  );
}
