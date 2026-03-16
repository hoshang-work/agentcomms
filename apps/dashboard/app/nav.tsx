"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Messages" },
  { href: "/agents", label: "Agents" },
  { href: "/channels", label: "Channels" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-800 bg-gray-900">
      <div className="mx-auto flex max-w-7xl items-center gap-8 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-white">
          AgentLink
        </Link>
        <div className="flex gap-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                pathname === l.href
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
