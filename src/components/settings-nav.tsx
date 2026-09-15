"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { can, type Role, type Permission } from "@/lib/permissions";

const SECTIONS: Array<{ href: string; label: string; icon: string; permission?: Permission }> = [
  { href: "/settings", label: "Business details", icon: "🏢" },
  { href: "/settings/numbering", label: "Numbering", icon: "🔢", permission: "settings.manage" },
  { href: "/settings/tax", label: "GST & tax rates", icon: "🧮", permission: "settings.manage" },
  { href: "/settings/categories", label: "Categories & job types", icon: "🗂️", permission: "settings.manage" },
  { href: "/settings/price-book", label: "Price book", icon: "📖", permission: "settings.manage" },
  { href: "/settings/templates", label: "Email wording", icon: "✉️", permission: "settings.manage" },
  { href: "/settings/users", label: "Who can sign in", icon: "🔑", permission: "users.manage" },
  { href: "/settings/receipts", label: "Receipt reading", icon: "🧾" },
  { href: "/settings/audit", label: "Audit trail", icon: "📜", permission: "audit.view" },
];

export function SettingsNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const visible = SECTIONS.filter((s) => !s.permission || can(role, s.permission));

  return (
    <nav aria-label="Settings sections" className="mb-5 flex gap-2 overflow-x-auto pb-1 lg:mb-0 lg:flex-col lg:overflow-visible">
      {visible.map((section) => {
        const active = pathname === section.href;
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "inline-flex min-h-[var(--tap)] shrink-0 items-center gap-2 rounded-lg border-2 px-3 text-sm font-bold",
              active ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-white text-ink-700",
            )}
          >
            <span aria-hidden="true">{section.icon}</span>
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
