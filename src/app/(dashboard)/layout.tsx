import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions";
import { requireAuth } from "@/lib/auth";

const links = [
  { href: "/", label: "Overview" },
  { href: "/reels", label: "Reels" },
  { href: "/problems", label: "Problems" },
];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireAuth();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border pb-4">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Trip Brain
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted transition hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>

        <form action={logoutAction} className="ml-auto">
          <button type="submit" className="text-sm text-muted transition hover:text-foreground">
            Sign out
          </button>
        </form>
      </header>

      <main className="flex-1 py-6">{children}</main>
    </div>
  );
}
