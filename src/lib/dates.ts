import {
  format, parseISO, startOfWeek, endOfWeek, addDays, differenceInCalendarDays,
  isValid, startOfMonth, endOfMonth, addMonths,
} from "date-fns";

export const WEEK_STARTS_ON = 1; // Monday

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? parseISO(value) : value;
  return isValid(d) ? d : null;
}

/** ISO date string for a `date` column: "2026-09-15". */
export function isoDate(value: Date | string): string {
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "yyyy-MM-dd");
}

export function today(): string {
  return isoDate(new Date());
}

/** "15 Sep 2026" — how Australians read a date. */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "d MMM yyyy") : "—";
}

export function formatDateShort(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "d MMM") : "—";
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "d MMM yyyy, h:mma").replace("AM", "am").replace("PM", "pm") : "—";
}

export function formatTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "h:mma").replace("AM", "am").replace("PM", "pm") : "—";
}

export function formatDayLabel(value: string | Date): string {
  const d = toDate(value)!;
  return format(d, "EEE d MMM");
}

export function weekStart(value: string | Date = new Date()): Date {
  return startOfWeek(toDate(value)!, { weekStartsOn: WEEK_STARTS_ON });
}

export function weekEnd(value: string | Date = new Date()): Date {
  return endOfWeek(toDate(value)!, { weekStartsOn: WEEK_STARTS_ON });
}

export function weekDays(value: string | Date = new Date()): Date[] {
  const start = weekStart(value);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthGrid(value: string | Date = new Date()): Date[] {
  const start = startOfWeek(startOfMonth(toDate(value)!), { weekStartsOn: WEEK_STARTS_ON });
  const end = endOfWeek(endOfMonth(toDate(value)!), { weekStartsOn: WEEK_STARTS_ON });
  const out: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function addDaysIso(value: string | Date, days: number): string {
  return isoDate(addDays(toDate(value)!, days));
}

export function daysBetween(a: string | Date, b: string | Date): number {
  return differenceInCalendarDays(toDate(b)!, toDate(a)!);
}

/**
 * Australian financial year: 1 July -> 30 June.
 * A date of 2026-09-15 is in FY2027 ("FY26/27").
 */
export function financialYear(value: string | Date = new Date(), startMonth = 7) {
  const d = toDate(value)!;
  const y = d.getFullYear();
  const startYear = d.getMonth() + 1 >= startMonth ? y : y - 1;
  return {
    startYear,
    endYear: startYear + 1,
    start: `${startYear}-${String(startMonth).padStart(2, "0")}-01`,
    end: isoDate(addDays(addMonths(parseISO(`${startYear}-${String(startMonth).padStart(2, "0")}-01`), 12), -1)),
    label: `FY${String(startYear).slice(2)}/${String(startYear + 1).slice(2)}`,
  };
}

/** Quarter within the financial year — what BAS is filed on. */
export function basQuarter(value: string | Date = new Date()) {
  const d = toDate(value)!;
  const m = d.getMonth() + 1;
  const q = m >= 7 && m <= 9 ? 1 : m >= 10 && m <= 12 ? 2 : m >= 1 && m <= 3 ? 3 : 4;
  return { quarter: q, label: `Q${q}` };
}

/** "3 days overdue" / "due in 5 days" / "due today". */
export function relativeDueLabel(due: string | Date | null | undefined): string {
  const d = toDate(due);
  if (!d) return "No due date";
  const diff = differenceInCalendarDays(d, new Date());
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff > 1) return `Due in ${diff} days`;
  if (diff === -1) return "1 day overdue";
  return `${Math.abs(diff)} days overdue`;
}

export function timeAgo(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}
