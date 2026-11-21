// Images added in Edit Mode (C3b): dropped from Finder, pasted, or picked
// for a Fill. Each one is uploaded to the dev server, which keeps it in
// .editmode/assets/ (named by its content) and serves it back. Push copies
// it into the project's own assets when it reaches the code.

const BASE = '/@edit-mode/assets';
const MAX_BYTES = 25_000_000;
export const isImageFile = (f) => /^image\/(png|jpeg|gif|webp|avif|svg\+xml)$/.test(f?.type || '');

// → { url, name, width, height } (natural size; 200 × 200 when the image has none, like some SVGs).
export async function uploadImage(file) {
  if (!isImageFile(file)) throw new Error('Only images: PNG, JPG, GIF, WebP, AVIF or SVG.');
  if (file.size > MAX_BYTES) throw new Error('Images up to 25 MB.');
  const ext = { 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' }[file.type] || file.type.slice(6);
  const res = await fetch(`${BASE}?name=${encodeURIComponent(`image.${ext}`)}`, { method: 'POST', body: file });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error || 'Upload failed.');
  const img = new Image();
  img.src = out.url;
  try { await img.decode(); } catch {}
  return {
    url: out.url,
    name: (file.name || '').replace(/\.[^.]+$/, '') || 'Image',
    width: img.naturalWidth || 200,
    height: img.naturalHeight || 200,
  };
}

// Ask for an image file (the system file dialog). Resolves null if cancelled.
export function pickImage(parent) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml';
    input.hidden = true;
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    input.addEventListener('cancel', () => { resolve(null); input.remove(); });
    parent.append(input);
    input.click();
  });
}

// The CSS for an image fill: Figma's Fill (cover), Fit (contain) or Tile.
export const IMAGE_FIT = {
  fill: { 'background-size': 'cover', 'background-position': 'center', 'background-repeat': 'no-repeat' },
  fit: { 'background-size': 'contain', 'background-position': 'center', 'background-repeat': 'no-repeat' },
  tile: { 'background-size': 'auto', 'background-position': '0% 0%', 'background-repeat': 'repeat' },
};
export function fitOf(cs) {
  const size = cs.backgroundSize.split(',')[0].trim();
  if (size === 'cover') return 'fill';
  if (size === 'contain') return 'fit';
  return cs.backgroundRepeat.split(',')[0].trim() === 'no-repeat' ? 'custom' : 'tile';
}
