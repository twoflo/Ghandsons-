import { z } from "zod";

/**
 * What we ask the model to return.
 *
 * Money comes back as a decimal STRING ("540.06"), not a number: models are
 * markedly better at transcribing digits verbatim than at arithmetic, and a
 * string round-trips through JSON without any float surprises. We convert to
 * integer cents ourselves in normalise().
 */

const confidence = z
  .number()
  .min(0)
  .max(100)
  .describe("How sure you are about this field, 0-100. Be honest — a smudged or guessed value should score low.");

const moneyString = z
  .string()
  .nullable()
  .describe('The amount exactly as printed, digits only, e.g. "540.06". null if not on the receipt.');

export const ReceiptExtractionSchema = z.object({
  isReceipt: z
    .boolean()
    .describe("False if this image is not a receipt, invoice or delivery docket at all."),

  supplierName: z.object({
    value: z.string().nullable().describe("The business name at the top of the receipt, as printed."),
    confidence,
  }),

  abn: z.object({
    value: z.string().nullable().describe("Australian Business Number, digits and spaces as printed."),
    confidence,
  }),

  date: z.object({
    value: z
      .string()
      .nullable()
      .describe(
        "The transaction date as yyyy-mm-dd. Australian receipts print dd/mm/yyyy — read it that way, not US order.",
      ),
    confidence,
    raw: z.string().nullable().describe("The date exactly as printed, before you reformatted it."),
  }),

  documentNumber: z.object({
    value: z.string().nullable().describe("Docket, receipt, order or invoice number."),
    confidence,
  }),

  subtotalCents: z.object({
    value: moneyString,
    confidence,
  }),

  taxCents: z.object({
    value: moneyString.describe('The GST amount, e.g. "49.10". null if the receipt shows no GST.'),
    confidence,
  }),

  totalCents: z.object({
    value: moneyString.describe("The final amount paid, including GST."),
    confidence,
  }),

  paymentMethod: z.object({
    value: z
      .string()
      .nullable()
      .describe('How it was paid, as printed, e.g. "EFTPOS VISA ****4412" or "ACCOUNT".'),
    confidence,
  }),

  lineItems: z
    .array(
      z.object({
        description: z.string().describe("The item description as printed."),
        quantity: z.string().describe('Quantity as printed, e.g. "24" or "2.5". Use "1" if not shown.'),
        unitPrice: moneyString.describe("Price per unit as printed."),
        lineTotal: moneyString.describe("Line amount as printed."),
        confidence,
      }),
    )
    .describe("Every line item you can read. Empty array if the receipt only shows a total."),

  notes: z
    .string()
    .nullable()
    .describe(
      "Anything the person checking this should know: a crease through the total, glare, a cut-off edge, an ambiguous digit. Plain English, one or two sentences. null if the image is clean.",
    ),
});

export type ReceiptExtractionRaw = z.infer<typeof ReceiptExtractionSchema>;
