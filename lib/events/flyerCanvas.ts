/**
 * Click Flyer (spec 06 §8, iOS `ClickFlyerSheet`): the event as a ready-to-post image for an
 * Instagram Story (9:16) or feed post (4:5). A Click ticket on a wash of the picture's own colors:
 * the picture, the title and who's hosting, then a tear line and a stub with the date, the place
 * and a QR to RSVP from a screenshot. Laid out in points at 360 wide and drawn at 3× (1080 px),
 * dark whatever the theme, so it matches the iOS flyer.
 */

export type FlyerFormat = 'story' | 'post';

export type FlyerContent = {
  title: string;
  /** "Hosted by …". */
  host: string | null;
  /** "OCT", "27". */
  month: string | null;
  day: string | null;
  /** "Sat · 7:00 PM": absolute, since a flyer is read days later. */
  when: string | null;
  place: string | null;
};

export type FlyerArt = {
  picture: CanvasImageSource & { width: number; height: number } | null;
  /** The event's generated colors, for an event without a picture. */
  gradient: string[];
  /** The QR to the event link, dark on white. */
  qr: CanvasImageSource;
  /** Display font family (Manrope) as the page loaded it. */
  displayFamily: string;
};

const SCALE = 3;
const INSET = 12;
const WHITE = (a: number) => `rgba(255,255,255,${a})`;
const SANS = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

type Metrics = {
  size: { w: number; h: number };
  cardWidth: number;
  photoAspects: [number, number];
  maxPhotoHeight: number;
  plainAspect: number;
  titleSize: number;
  titleTop: number;
  brandGap: number;
};

const METRICS: Record<FlyerFormat, Metrics> = {
  story: {
    size: { w: 360, h: 640 },
    cardWidth: 284,
    photoAspects: [1.0, 1.91],
    maxPhotoHeight: 250,
    plainAspect: 1.6,
    titleSize: 27,
    titleTop: 14,
    brandGap: 20,
  },
  post: {
    size: { w: 360, h: 450 },
    cardWidth: 304,
    photoAspects: [1.7, 2.4],
    maxPhotoHeight: 150,
    plainAspect: 2.1,
    titleSize: 23,
    titleTop: 12,
    brandGap: 14,
  },
};

export function flyerPixelSize(format: FlyerFormat): { width: number; height: number } {
  const { w, h } = METRICS[format].size;
  return { width: w * SCALE, height: h * SCALE };
}

/** The picture's frame: its own shape where the format allows, never taller than the cap. */
export function flyerPhotoFrame(format: FlyerFormat, picture: { width: number; height: number } | null): { w: number; h: number } {
  const m = METRICS[format];
  const w = m.cardWidth - 2 * INSET;
  const aspect = picture ? picture.width / Math.max(picture.height, 1) : m.plainAspect;
  const clamped = Math.min(Math.max(aspect, m.photoAspects[0]), m.photoAspects[1]);
  return { w, h: Math.round(Math.min(w / clamped, m.maxPhotoHeight)) };
}

/** A picture close to its frame's shape fills it (a light crop); a poster far from it shows whole. */
export function flyerPhotoFills(picture: { width: number; height: number }, frame: { w: number; h: number }): boolean {
  const ratio = picture.width / Math.max(picture.height, 1) / (frame.w / Math.max(frame.h, 1));
  return ratio >= 0.7 && ratio <= 1.4;
}

/** Saturated and dark enough for small type on white; a grey picture falls back to Click violet. */
export function deepenedAccent(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (saturation < 0.18) return '#7C3AED';
  let hue = 0;
  const d = max - min;
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  if (d > 0) {
    if (max === rn) hue = ((gn - bn) / d) % 6;
    else if (max === gn) hue = (bn - rn) / d + 2;
    else hue = (rn - gn) / d + 4;
  }
  hue = (hue * 60 + 360) % 360;
  const s = Math.max(saturation, 0.6);
  const v = Math.min(Math.max(max, 0.45), 0.7);
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  const [r1, g1, b1] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r1)}${hex(g1)}${hex(b1)}`;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  return [c, ctx];
}

/** The picture shrunk to a few pixels: stretched, it's a smooth wash of its colors. */
function swatch(picture: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const w = 16;
  const h = Math.max(1, Math.round((16 * picture.height) / Math.max(picture.width, 1)));
  const [c, ctx] = canvas(w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(picture, 0, 0, w, h);
  return c;
}

function averageColor(source: HTMLCanvasElement): [number, number, number] {
  const [, ctx] = canvas(1, 1);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** Fill `w`×`h` at (x, y) with the image, cropping (cover) or letterboxing (contain). */
function drawFitted(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  w: number,
  h: number,
  mode: 'cover' | 'contain',
  zoom = 1,
) {
  const scale = (mode === 'cover' ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height)) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** A soft wash: blurred where the browser can filter a canvas, else a smooth upscale of the swatch. */
function drawWash(ctx: CanvasRenderingContext2D, wash: HTMLCanvasElement, x: number, y: number, w: number, h: number, zoom: number) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if ('filter' in ctx) ctx.filter = `blur(${24 * SCALE}px) saturate(1.3)`;
  drawFitted(ctx, wash, x, y, w, h, 'cover', zoom);
  ctx.restore();
}

function linearGradient(ctx: CanvasRenderingContext2D, colors: string[], x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  colors.forEach((c, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
  return g;
}

/** Film grain, made once per render: monochrome noise, tiled, so the wash doesn't band. */
function grain(): HTMLCanvasElement {
  const size = 240;
  const [c, ctx] = canvas(size, size);
  const data = ctx.createImageData(size, size);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.random() * 255;
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

/** Words into at most `max` lines of `width`; the last one ends in "…" when text is left over. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): { lines: string[]; overflow: boolean } {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(next).width <= width || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = words[i];
    if (lines.length === max) break;
  }
  if (lines.length < max && line) {
    lines.push(line);
    line = '';
    i = words.length;
  }
  const overflow = i < words.length || lines.some((l) => ctx.measureText(l).width > width);
  return { lines, overflow };
}

/** `text` cut to fit `width` with "…"; `force` adds the "…" even when it fits (more text follows). */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, width: number, force = false): string {
  if (!force && ctx.measureText(text).width <= width) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > width) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Lucide's calendar glyph (24-unit grid), for an event without a picture. */
function drawCalendarGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = WHITE(0.92);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 6;
  ctx.stroke(new Path2D('M8 2v4M16 2v4M3 10h18'));
  ctx.stroke(new Path2D('M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'));
  ctx.restore();
}

/** The Click mark (`public/brand/logo-mark.svg`, dark-theme colors) on a 128-unit grid. */
function drawClickMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x + size, y);
  ctx.scale(-size / 128, size / 128);
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#c3a6ff';
  roundRect(ctx, 24, 48, 52, 52, 6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(195,166,255,0.45)';
  ctx.beginPath();
  ctx.arc(82, 46, 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Draws the flyer at 3× into a new canvas. */
export function renderFlyer(format: FlyerFormat, content: FlyerContent, art: FlyerArt): HTMLCanvasElement {
  const m = METRICS[format];
  const { w: W, h: H } = m.size;
  const [out, ctx] = canvas(W * SCALE, H * SCALE);
  ctx.scale(SCALE, SCALE);
  const display = (size: number) => `800 ${size}px ${art.displayFamily}`;
  const sans = (weight: number, size: number) => `${weight} ${size}px ${SANS}`;
  const wash = art.picture ? swatch(art.picture) : null;
  const accent = wash ? deepenedAccent(...averageColor(wash)) : '#7C3AED';

  // Backdrop: the picture's colors, stretched and softened, lit from the top, dimmed below.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (wash) drawWash(ctx, wash, 0, 0, W, H, 1.25);
  else {
    ctx.fillStyle = linearGradient(ctx, art.gradient, 0, 0, W, H);
    ctx.fillRect(0, 0, W, H);
  }
  const light = ctx.createRadialGradient(W * 0.2, 0, 0, W * 0.2, 0, W);
  light.addColorStop(0, WHITE(0.18));
  light.addColorStop(1, WHITE(0));
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);
  const dim = ctx.createLinearGradient(0, 0, 0, H);
  dim.addColorStop(0, 'rgba(0,0,0,0.05)');
  dim.addColorStop(0.5, 'rgba(0,0,0,0.28)');
  dim.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = dim;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(grain(), 'repeat') ?? 'transparent';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillRect(0, 0, W * SCALE, H * SCALE);
  ctx.restore();

  // Measure the ticket top to bottom so it and the brand sit centered together.
  const photo = flyerPhotoFrame(format, art.picture);
  const textX = INSET + 6;
  const textW = photo.w - 12;
  let titleSize = m.titleSize;
  ctx.font = display(titleSize);
  let title = wrap(ctx, content.title, textW, 2);
  while (title.overflow && titleSize > m.titleSize * 0.7) {
    titleSize -= 1;
    ctx.font = display(titleSize);
    title = wrap(ctx, content.title, textW, 2);
  }
  if (title.overflow) title.lines[title.lines.length - 1] = ellipsize(ctx, title.lines[title.lines.length - 1], textW, true);
  const titleLine = Math.round(titleSize * 1.12);
  const hostH = content.host ? 5 + 17 : 0;
  const perforation = 40;
  // The stub's row is as tall as the QR (58), with 2 below.
  const stubH = 60;
  const cardH = INSET + photo.h + m.titleTop + title.lines.length * titleLine + hostH + perforation + stubH + INSET;
  const brandH = 20;
  const top = Math.round((H - (cardH + m.brandGap + brandH)) / 2);
  const left = Math.round((W - m.cardWidth) / 2);
  const perfY = top + INSET + photo.h + m.titleTop + title.lines.length * titleLine + hostH + perforation / 2;

  // The ticket's glass, with the tear line's notches punched through it.
  const [glass, g] = canvas(W * SCALE, H * SCALE);
  g.scale(SCALE, SCALE);
  roundRect(g, left, top, m.cardWidth, cardH, 30);
  g.fillStyle = WHITE(0.13);
  g.fill();
  g.strokeStyle = WHITE(0.22);
  g.lineWidth = 1;
  roundRect(g, left + 0.5, top + 0.5, m.cardWidth - 1, cardH - 1, 29.5);
  g.stroke();
  g.globalCompositeOperation = 'destination-out';
  for (const cx of [left, left + m.cardWidth]) {
    g.beginPath();
    g.arc(cx, perfY, 10, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 28 * SCALE;
  ctx.shadowOffsetY = 16 * SCALE;
  ctx.drawImage(glass, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, left, top, m.cardWidth, cardH, 30);
  ctx.clip();
  ctx.strokeStyle = WHITE(0.22);
  ctx.lineWidth = 1;
  for (const cx of [left, left + m.cardWidth]) {
    ctx.beginPath();
    ctx.arc(cx, perfY, 9.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // The picture.
  const px = left + INSET;
  const py = top + INSET;
  ctx.save();
  roundRect(ctx, px, py, photo.w, photo.h, 20);
  ctx.clip();
  if (art.picture && wash) {
    if (flyerPhotoFills(art.picture, photo)) drawFitted(ctx, art.picture, px, py, photo.w, photo.h, 'cover');
    else {
      drawWash(ctx, wash, px, py, photo.w, photo.h, 1.3);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(px, py, photo.w, photo.h);
      drawFitted(ctx, art.picture, px, py, photo.w, photo.h, 'contain');
    }
  } else {
    ctx.fillStyle = linearGradient(ctx, art.gradient, px, py, photo.w, photo.h);
    ctx.fillRect(px, py, photo.w, photo.h);
    drawCalendarGlyph(ctx, px + photo.w / 2, py + photo.h / 2, 40);
  }
  ctx.restore();

  // Title and host.
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.font = display(titleSize);
  let y = py + photo.h + m.titleTop;
  for (const line of title.lines) {
    y += titleLine;
    ctx.fillText(line, left + textX, y - titleLine * 0.22);
  }
  if (content.host) {
    ctx.font = sans(500, 13);
    ctx.fillStyle = WHITE(0.72);
    ctx.fillText(ellipsize(ctx, content.host, textW), left + textX, y + 5 + 13);
  }

  // Tear line.
  ctx.save();
  ctx.strokeStyle = WHITE(0.3);
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(left + INSET + 12, perfY);
  ctx.lineTo(left + m.cardWidth - INSET - 12, perfY);
  ctx.stroke();
  ctx.restore();

  // Stub: date tile, when and where, QR.
  const sy = perfY + perforation / 2;
  const mid = sy + 29;
  let sx = left + INSET + 4;
  const qrSize = 58;
  const qrX = left + m.cardWidth - INSET - 4 - qrSize;
  if (content.month && content.day) {
    ctx.fillStyle = '#fff';
    roundRect(ctx, sx, mid - 26, 46, 52, 12);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = sans(800, 10);
    ctx.letterSpacing = '0.8px';
    ctx.fillText(content.month, sx + 23, mid - 7);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = '#141414';
    ctx.font = display(23);
    ctx.fillText(content.day, sx + 23, mid + 17);
    ctx.textAlign = 'left';
    sx += 46 + 12;
  }
  const infoW = qrX - 12 - sx;
  // when (15 pt, ~18 tall) over place (13 pt, ~16 tall), 2 apart, centered on the row.
  const blockH = (content.when ? 18 : 0) + (content.place ? 16 : 0) + (content.when && content.place ? 2 : 0);
  let ly = mid - blockH / 2;
  if (content.when) {
    ctx.fillStyle = '#fff';
    ctx.font = sans(600, 15);
    ctx.fillText(ellipsize(ctx, content.when, infoW), sx, ly + 14);
    ly += 20;
  }
  if (content.place) {
    ctx.fillStyle = WHITE(0.72);
    ctx.font = sans(400, 13);
    ctx.fillText(ellipsize(ctx, content.place, infoW), sx, ly + 12);
  }
  ctx.fillStyle = '#fff';
  roundRect(ctx, qrX, sy, qrSize, qrSize, 12);
  ctx.fill();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art.qr, qrX + 6, sy + 6, qrSize - 12, qrSize - 12);
  ctx.imageSmoothingEnabled = true;

  // Brand.
  ctx.font = display(16);
  const word = 'Click';
  const brandW = 20 + 7 + ctx.measureText(word).width;
  const bx = Math.round((W - brandW) / 2);
  const by = top + cardH + m.brandGap;
  drawClickMark(ctx, bx, by, 20);
  ctx.fillStyle = WHITE(0.9);
  ctx.fillText(word, bx + 27, by + 15.5);

  return out;
}
