import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Transit Copilot — Boston",
  description: "Ask it how to get across Boston. It checks the T in real time.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-display text-mbta-ink antialiased">{children}</body>
    </html>
  );
}
