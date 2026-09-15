/**
 * Shrinks a phone photo in the browser before it goes anywhere near the
 * network.
 *
 * A modern phone camera produces 4-8MB per shot. A receipt only needs enough
 * resolution to read 8pt thermal print — about 1600px on the long edge. This
 * routinely turns a 6MB upload into 350KB, which is the difference between
 * "sent" and "still spinning" on a bar and a half of 4G at the back of a
 * block of units.
 *
 * If anything at all goes wrong it hands back the original file. A slightly
 * slow upload beats a lost docket.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;
/** Below this it isn't worth re-encoding. */
const SKIP_UNDER_BYTES = 400 * 1024;

export async function compressImage(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/svg+xml") return file;
  if (file.size < SKIP_UNDER_BYTES) return file;

  try {
    const bitmap = await loadBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    // Already small enough and not worth re-encoding.
    if (scale === 1 && file.size < 1_500_000) {
      close(bitmap);
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      close(bitmap);
      return file;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // White behind it, so a PNG with transparency doesn't come out black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
    close(bitmap);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );

    if (!blob || blob.size >= file.size) return file;

    return new File([blob], replaceExtension(file.name, "jpg"), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

type Bitmap = ImageBitmap | HTMLImageElement;

async function loadBitmap(file: File): Promise<Bitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      // imageOrientation honours the EXIF rotation a phone writes, so a
      // receipt shot in portrait doesn't arrive on its side.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through to the <img> path */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not decode that image"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

function close(bitmap: Bitmap) {
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
}

function replaceExtension(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "receipt"}.${ext}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
