import { toGray, type Gray } from "@core/gapscan";
import { fitSize } from "./scan";

// Browser only (DOM + canvas). The native app gets its frames from the AR view instead; see measure.ts.

export type Photo = { uri: string; size: { width: number; height: number }; gray: Gray };

/** Opens the browser's picker; on phones that offers the camera or the gallery. Resolves null if the user backs out. */
export function pickPhoto(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/**
 * Decodes the photo once at measuring size. The preview is exported from the same canvas,
 * so corner positions dragged on screen are in exactly the pixels measureGaps reads.
 */
export async function loadPhoto(file: File): Promise<Photo> {
  if (file.type && !file.type.startsWith("image/")) throw new Error(`${file.name} isn’t an image`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); // honour the phone's EXIF rotation
  } catch (err) {
    console.error("createImageBitmap failed", { type: file.type, bytes: file.size, err });
    throw new Error("this browser can’t read that file. Try a JPEG or PNG");
  }
  try {
    const size = fitSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("this browser has no 2D canvas");
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const { data } = ctx.getImageData(0, 0, size.width, size.height);
    return { uri: canvas.toDataURL("image/jpeg", 0.92), size, gray: toGray(data, size.width, size.height) };
  } finally {
    bitmap.close();
  }
}
