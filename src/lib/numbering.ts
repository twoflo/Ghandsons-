import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";

export type SequenceKey =
  | "job" | "quote" | "invoice" | "purchase_order" | "variation" | "expense" | "incident";

/**
 * Takes the next document number, locking the sequence row for the life of the
 * surrounding transaction. Two invoices raised at the same instant get
 * different numbers; a rolled-back invoice releases its number back.
 *
 * MUST be called inside a transaction, alongside the insert it numbers.
 */
export async function nextNumber(tx: DbOrTx, key: SequenceKey): Promise<string> {
  const rows = await tx.execute<{ prefix: string; next_value: number; padding: number }>(
    sql`UPDATE number_sequences
          SET next_value = next_value + 1, updated_at = now()
        WHERE key = ${key}
        RETURNING prefix, next_value - 1 AS next_value, padding`,
  );

  const row = (rows as unknown as Array<{ prefix: string; next_value: number; padding: number }>)[0];
  if (!row) {
    throw new Error(
      `Numbering for "${key}" is not set up. Add it under Settings → Numbering.`,
    );
  }

  return `${row.prefix}${String(row.next_value).padStart(row.padding, "0")}`;
}

/** Peek without consuming — for the "next number will be ..." hint in Settings. */
export async function peekNumber(tx: DbOrTx, key: SequenceKey): Promise<string | null> {
  const rows = await tx.execute<{ prefix: string; next_value: number; padding: number }>(
    sql`SELECT prefix, next_value, padding FROM number_sequences WHERE key = ${key}`,
  );
  const row = (rows as unknown as Array<{ prefix: string; next_value: number; padding: number }>)[0];
  if (!row) return null;
  return `${row.prefix}${String(row.next_value).padStart(row.padding, "0")}`;
}
