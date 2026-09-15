/**
 * Plain constants, kept out of queries.ts so client components can import
 * them without dragging the database driver into the browser bundle.
 */

export const COMPLIANCE_KINDS = [
  { value: "licence", label: "Licence" },
  { value: "insurance", label: "Insurance" },
  { value: "certification", label: "Ticket / certification" },
  { value: "registration", label: "Registration" },
  { value: "induction", label: "Induction / card" },
] as const;

export const SEVERITIES = [
  { value: "near_miss", label: "Near miss", tone: "neutral" as const },
  { value: "first_aid", label: "First aid", tone: "info" as const },
  { value: "minor", label: "Minor injury", tone: "warn" as const },
  { value: "serious", label: "Serious injury", tone: "bad" as const },
  { value: "notifiable", label: "Notifiable incident", tone: "bad" as const },
] as const;

export const SAFETY_DOC_KINDS = [
  { value: "swms", label: "SWMS" },
  { value: "jsa", label: "JSA" },
  { value: "risk_assessment", label: "Risk assessment" },
  { value: "permit", label: "Permit" },
  { value: "toolbox_talk", label: "Toolbox talk" },
] as const;
