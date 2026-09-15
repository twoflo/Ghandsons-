"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { can, type Role } from "@/lib/permissions";
import type { Permission } from "@/lib/permissions";

const TABS: Array<{ slug: string; label: string; permission?: Permission }> = [
  { slug: "", label: "Overview" },
  { slug: "money", label: "Money", permission: "jobs.viewCosts" },
  { slug: "time", label: "Time" },
  { slug: "expenses", label: "Expenses", permission: "expenses.view" },
  { slug: "quotes", label: "Quotes", permission: "quotes.view" },
  { slug: "invoices", label: "Invoices", permission: "invoices.view" },
  { slug: "variations", label: "Variations" },
  { slug: "purchase-orders", label: "Orders", permission: "po.view" },
  { slug: "photos", label: "Photos" },
  { slug: "documents", label: "Documents" },
  { slug: "safety", label: "Safety" },
];

export function JobTabs({ jobId, role }: { jobId: string; role: Role }) {
  const pathname = usePathname();
  const base = `/jobs/${jobId}`;
  const visible = TABS.filter((t) => !t.permission || can(role, t.permission));

  return (
    <nav
      aria-label="Job sections"
      className="-mx-3 overflow-x-auto border-b border-ink-300 px-3 sm:mx-0 sm:px-0"
    >
      <ul className="flex min-w-max gap-1">
        {visible.map((tab) => {
          const href = tab.slug ? `${base}/${tab.slug}` : base;
          const active = tab.slug ? pathname === href : pathname === base;
          return (
            <li key={tab.slug || "overview"}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "inline-flex min-h-[var(--tap)] items-center border-b-[3px] px-3 text-sm font-bold transition-colors",
                  active
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-ink-600 hover:text-ink-900",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
