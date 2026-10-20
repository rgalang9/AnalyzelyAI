import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DatasetProvider } from "./dataset-context";
import AppShell from "./app-shell";
import TopBar from "./top-bar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Analyzely",
  description: "AI-powered data cleaning and analysis",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DatasetProvider>
          <TopBar />
          <AppShell>{children}</AppShell>
        </DatasetProvider>
      </body>
    </html>
  );
}
