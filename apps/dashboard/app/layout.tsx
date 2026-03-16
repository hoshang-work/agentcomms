import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "./nav";

export const metadata: Metadata = {
  title: "AgentLink Dashboard",
  description: "Observability dashboard for AgentLink",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <Nav />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
