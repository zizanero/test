import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Populace",
  description: "A workbench for LLM-driven social simulations.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg-0 text-ink-0">{children}</body>
    </html>
  );
}
