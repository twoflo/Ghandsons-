/**
 * Stage one of the pipeline: pull a text layer off the image.
 *
 * It's optional. The vision model reads the photo directly and is generally
 * better than OCR on thermal print, but an OCR pass is cheap, gives the model
 * a second opinion on ambiguous digits, and makes the receipt text searchable
 * afterwards. Set OCR_PROVIDER=tesseract to turn it on.
 */

export type OcrResult = { text: string | null; provider: string; elapsedMs: number };

export async function runOcr(image: Buffer, mimeType: string): Promise<OcrResult> {
  const started = Date.now();
  const provider = (process.env.OCR_PROVIDER ?? "none").toLowerCase();

  if (provider !== "tesseract") {
    return { text: null, provider: "none", elapsedMs: 0 };
  }

  if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml") {
    return { text: null, provider: "tesseract", elapsedMs: Date.now() - started };
  }

  try {
    // Optional dependency, imported lazily so the app runs without it.
    // Not a declared dependency — the import specifier is built at runtime so
    // TypeScript doesn't demand the types for an optional package.
    const specifier = "tesseract.js";
    const tesseract = (await import(/* webpackIgnore: true */ specifier).catch(() => null)) as
      | { recognize: (img: Buffer, lang: string) => Promise<{ data: { text: string } }> }
      | null;

    if (!tesseract) {
      console.warn(
        "[ocr] OCR_PROVIDER=tesseract but tesseract.js isn't installed. Run: npm install tesseract.js",
      );
      return { text: null, provider: "none", elapsedMs: Date.now() - started };
    }

    const result = await tesseract.recognize(image, "eng");
    return { text: result.data.text.trim() || null, provider: "tesseract", elapsedMs: Date.now() - started };
  } catch (error) {
    // OCR is a nice-to-have. Losing it must never lose the receipt.
    console.warn("[ocr] failed, carrying on without it:", error);
    return { text: null, provider: "tesseract", elapsedMs: Date.now() - started };
  }
}
