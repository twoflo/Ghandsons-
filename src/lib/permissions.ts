export type Role = "owner" | "office" | "field";

/**
 * Three roles, deliberately coarse. The owner sees everything; office runs the
 * paperwork but can't change pay rates or settings; field workers see their own
 * day, their jobs and can log time, expenses and photos — and never see a cost
 * rate, a margin or another worker's pay.
 */
export const PERMISSIONS = {
  "jobs.view": ["owner", "office", "field"],
  "jobs.viewAll": ["owner", "office"],
  "jobs.manage": ["owner", "office"],
  "jobs.delete": ["owner"],
  "jobs.viewCosts": ["owner", "office"],
  "jobs.viewMargin": ["owner"],

  "clients.view": ["owner", "office"],
  "clients.manage": ["owner", "office"],
  "clients.delete": ["owner"],

  "quotes.view": ["owner", "office"],
  "quotes.manage": ["owner", "office"],
  "quotes.delete": ["owner"],

  "invoices.view": ["owner", "office"],
  "invoices.manage": ["owner", "office"],
  "invoices.void": ["owner"],
  "payments.manage": ["owner", "office"],

  "expenses.view": ["owner", "office"],
  "expenses.create": ["owner", "office", "field"],
  "expenses.manage": ["owner", "office"],
  "expenses.delete": ["owner"],

  "receipts.upload": ["owner", "office", "field"],
  "receipts.review": ["owner", "office"],

  "schedule.view": ["owner", "office", "field"],
  "schedule.manage": ["owner", "office"],

  "time.logOwn": ["owner", "office", "field"],
  "time.viewAll": ["owner", "office"],
  "time.approve": ["owner"],
  "crew.view": ["owner", "office"],
  "crew.manage": ["owner"],
  "crew.viewRates": ["owner"],

  "suppliers.view": ["owner", "office"],
  "suppliers.manage": ["owner", "office"],
  "po.view": ["owner", "office", "field"],
  "po.manage": ["owner", "office"],

  "documents.view": ["owner", "office", "field"],
  "documents.manage": ["owner", "office", "field"],
  "documents.delete": ["owner", "office"],

  "variations.view": ["owner", "office", "field"],
  "variations.manage": ["owner", "office"],
  "variations.approve": ["owner"],

  "compliance.view": ["owner", "office", "field"],
  "compliance.manage": ["owner", "office"],
  "incidents.create": ["owner", "office", "field"],

  "reports.view": ["owner", "office"],
  "reports.viewProfit": ["owner"],
  "reports.export": ["owner", "office"],

  "settings.view": ["owner", "office"],
  "settings.manage": ["owner"],
  "users.manage": ["owner"],
  "audit.view": ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  office: "Office",
  field: "Field worker",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full access, including money, pay rates and settings.",
  office: "Jobs, clients, quotes, invoices and receipts. Cannot change pay rates or settings.",
  field: "Their own schedule and timesheets, plus photos, receipts and site notes.",
};
