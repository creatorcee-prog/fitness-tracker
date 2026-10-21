/**
 * Shrinks a picked photo in the browser before it's saved, so a 12 MP phone
 * picture becomes a ~20 KB avatar or ~100 KB banner. Center-cropped to the
 * target shape, JPEG.
 */
export const AVATAR = { w: 256, h: 256, maxChars: 190_000 };
export const BANNER = { w: 1200, h: 400, maxChars: 580_000 };

export async function resizeImage(file: File, target: { w: number; h: number; maxChars: number }): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't an image.");
  const bitmap = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = target.w;
  canvas.height = target.h;
  const ctx = canvas.getContext("2d")!;
  // Center-crop: scale so the image covers the target, then cut the overflow.
  const scale = Math.max(target.w / bitmap.width, target.h / bitmap.height);
  const sw = target.w / scale;
  const sh = target.h / scale;
  ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, target.w, target.h);
  // Lower the quality until it fits the database limit.
  for (let q = 0.85; q >= 0.4; q -= 0.15) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= target.maxChars) return url;
  }
  throw new Error("That image is too detailed to shrink enough. Try another one.");
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image (HEIC from some iPhones isn't supported by every browser; try a JPEG or PNG)."));
    };
    img.src = url;
  });
}
