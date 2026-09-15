"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { NAV_ITEMS, MOBILE_NAV, GROUP_LABELS, type NavItem } from "./nav-config";
import type { Role } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/permissions";

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

export function AppShell({
  user,
  items,
  businessName,
  reviewCount,
  children,
}: {
  user: { fullName: string; role: Role; email: string };
  items: NavItem[];
  businessName: string;
  reviewCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const mobileHrefs = MOBILE_NAV[user.role] ?? MOBILE_NAV.owner!;
  const mobileItems = mobileHrefs
    .map((href) => items.find((i) => i.href === href))
    .filter((i): i is NavItem => Boolean(i));

  const grouped = (["work", "money", "admin"] as const)
    .map((group) => ({ group, entries: items.filter((i) => i.group === group) }))
    .filter((g) => g.entries.length > 0);

  return (
    <div className="min-h-dvh lg:flex">
      {/* ---------------------------- laptop sidebar ---------------------------- */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900 lg:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 font-black text-white">
            G
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold text-white">{businessName}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Main">
          {grouped.map(({ group, entries }) => (
            <div key={group} className="mb-4">
              <p className="px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink-500">
                {GROUP_LABELS[group]}
              </p>
              <ul className="space-y-0.5">
                {entries.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive(pathname, item.href) ? "page" : undefined}
                      className={clsx(
                        "flex min-h-[var(--tap)] items-center gap-3 rounded-lg px-3 text-[15px] font-semibold transition-colors",
                        isActive(pathname, item.href)
                          ? "bg-brand-600 text-white"
                          : "text-ink-300 hover:bg-ink-800 hover:text-white",
                      )}
                    >
                      <span aria-hidden="true" className="text-lg">{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {item.href === "/receipts" && reviewCount > 0 ? (
                        <span className="rounded-full bg-warn-500 px-2 py-0.5 text-xs font-black text-ink-900">
                          {reviewCount}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-800 p-3">
          <UserBlock user={user} />
        </div>
      </aside>

      {/* ------------------------------ main area ------------------------------ */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-ink-800 bg-ink-900 px-3 py-2 lg:hidden"
                style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top, 0px))" }}>
          <Link href="/dashboard" className="flex items-center gap-2 py-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-black text-white">
              G
            </div>
            <span className="font-bold text-white">{businessName}</span>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl text-white hover:bg-ink-800"
          >
            <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
          </button>
        </header>

        {menuOpen ? (
          <div id="mobile-menu" className="border-b border-ink-800 bg-ink-900 px-3 pb-4 lg:hidden">
            {grouped.map(({ group, entries }) => (
              <div key={group} className="mb-3">
                <p className="px-1 py-1 text-xs font-bold uppercase tracking-wider text-ink-500">
                  {GROUP_LABELS[group]}
                </p>
                <ul className="grid grid-cols-2 gap-1.5">
                  {entries.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className={clsx(
                          "flex min-h-[var(--tap)] items-center gap-2 rounded-lg px-3 text-[15px] font-semibold",
                          isActive(pathname, item.href)
                            ? "bg-brand-600 text-white"
                            : "bg-ink-800 text-ink-200",
                        )}
                      >
                        <span aria-hidden="true">{item.icon}</span>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="mt-3 rounded-lg bg-ink-800 p-3">
              <UserBlock user={user} />
            </div>
          </div>
        ) : null}

        <main className="flex-1 px-3 pb-28 pt-4 sm:px-5 lg:px-8 lg:pb-10">{children}</main>
      </div>

      {/* --------------------------- phone bottom bar --------------------------- */}
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-ink-300 bg-white lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {mobileItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={clsx(
              "relative flex min-h-[3.75rem] flex-col items-center justify-center gap-0.5 text-[11px] font-bold",
              isActive(pathname, item.href) ? "text-brand-700" : "text-ink-600",
            )}
          >
            <span aria-hidden="true" className="text-xl leading-none">{item.icon}</span>
            {item.short ?? item.label}
            {item.href === "/receipts" && reviewCount > 0 ? (
              <span className="absolute right-3 top-2 min-w-5 rounded-full bg-warn-500 px-1 text-[10px] font-black leading-5 text-ink-900">
                {reviewCount}
              </span>
            ) : null}
          </Link>
        ))}
        {/* The one button he presses most: snap a docket. */}
        <Link
          href="/receipts/capture"
          className="flex min-h-[3.75rem] flex-col items-center justify-center gap-0.5 bg-brand-600 text-[11px] font-bold text-white"
        >
          <span aria-hidden="true" className="text-xl leading-none">📷</span>
          Snap
        </Link>
      </nav>
    </div>
  );
}

function UserBlock({ user }: { user: { fullName: string; role: Role; email: string } }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-700 text-sm font-bold text-white">
        {user.fullName
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{user.fullName}</p>
        <p className="truncate text-xs text-ink-400">{ROLE_LABELS[user.role]}</p>
      </div>
      <form action="/api/logout" method="post">
        <button
          type="submit"
          className="rounded-md px-2 py-2 text-xs font-bold text-ink-300 hover:bg-ink-700 hover:text-white"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
