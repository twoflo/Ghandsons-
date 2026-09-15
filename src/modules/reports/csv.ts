/**
 * CSV the way Excel on a Windows laptop wants it.
 *
 * The BOM is what stops "Ferraro" turning into "FerrÃ¡ro" when the
 * accountant opens it, and CRLF is what stops the whole file landing in one
 * row. Both are unglamorous and both matter more than anything else here.
 */

export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const escape = (value: string | number | null): string => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    // A leading =, +, - or @ makes Excel treat the cell as a formula.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };

  const lines = [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Cents as a plain decimal — no currency symbol, so spreadsheets sum it. */
export function csvMoney(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2);
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
