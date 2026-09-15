import type { Permission } from "@/lib/permissions";

export type NavItem = {
  href: string;
  label: string;
  /** Short label for the phone's bottom bar. */
  short?: string;
  icon: string;
  permission?: Permission;
  group: "work" | "money" | "admin";
};

/**
 * One list, rendered two ways: a bottom bar on the phone (first five the
 * signed-in role can see) and a sidebar on the laptop.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: "🏠", group: "work" },
  { href: "/jobs", label: "Jobs", icon: "🔨", group: "work" },
  { href: "/schedule", label: "Schedule", icon: "📅", group: "work", permission: "schedule.view" },
  { href: "/receipts", label: "Receipts", icon: "🧾", group: "money", permission: "receipts.upload" },
  { href: "/clients", label: "Clients", icon: "👥", group: "work", permission: "clients.view" },
  { href: "/quotes", label: "Quotes", icon: "📝", group: "money", permission: "quotes.view" },
  { href: "/invoices", label: "Invoices", icon: "💰", group: "money", permission: "invoices.view" },
  { href: "/expenses", label: "Expenses", icon: "💳", group: "money", permission: "expenses.view" },
  { href: "/timesheets", label: "Timesheets", short: "Time", icon: "⏱️", group: "work", permission: "time.logOwn" },
  { href: "/crew", label: "Crew", icon: "🦺", group: "admin", permission: "crew.view" },
  { href: "/suppliers", label: "Suppliers", icon: "🚚", group: "money", permission: "suppliers.view" },
  { href: "/purchase-orders", label: "Purchase orders", short: "POs", icon: "📦", group: "money", permission: "po.view" },
  { href: "/compliance", label: "Compliance", icon: "🛡️", group: "admin", permission: "compliance.view" },
  { href: "/reports", label: "Reports", icon: "📊", group: "money", permission: "reports.view" },
  { href: "/settings", label: "Settings", icon: "⚙️", group: "admin", permission: "settings.view" },
];

/** What sits in the phone's bottom bar, per role. Five slots, no more. */
export const MOBILE_NAV: Record<string, string[]> = {
  owner: ["/dashboard", "/jobs", "/receipts", "/invoices"],
  office: ["/dashboard", "/jobs", "/receipts", "/invoices"],
  field: ["/dashboard", "/jobs", "/receipts", "/timesheets"],
};

export const GROUP_LABELS: Record<NavItem["group"], string> = {
  work: "Work",
  money: "Money",
  admin: "Business",
};
