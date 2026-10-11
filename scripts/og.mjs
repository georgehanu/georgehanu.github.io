// Share images (Open Graph, 1200×630) for the hub and for every guide site.
//
// One layout for every image: a small accent mark, a kicker, a big title, a short
// description, and a footer with the page's address. Only the words and the accent change,
// and they all come from data/ (see shareCards). Text is measured by rendering it, so a long
// title shrinks or wraps instead of overflowing.
//
//   og.png                  the home page, and the fallback for every other page
//   og/<series>.png         a series page
//   og/guides/<guide>.png   a guide, used by the guide's own site for its index and lesson pages

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error("sharp is missing: run npm install once, then build again.");
  process.exit(1);
}

export const WIDTH = 1200;
export const HEIGHT = 630;

const FONT = "Inter, Segoe UI, Arial, sans-serif";
const DEFAULT_ACCENT = "#0f766e"; // the hub's own accent: Beyond "It Works" teal
const COLOURS = { bg: "#121214", text: "#ecebe8", soft: "#cfccc6", muted: "#a39f97", line: "#2c2c31" };
const X = 80; // left and right margin
const TEXT_WIDTH = WIDTH - 2 * X;

const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const lessonCount = (list) => list.reduce((n, g) => n + g.lessons.length, 0);

// Mix some text colour into an accent so it stays visible on the dark background,
// the same trick style.css uses for accent-coloured text in dark mode.
function lift(hex, amount = 0.4) {
  const rgb = (h) => (h.length === 4 ? [...h.slice(1)].map((c) => parseInt(c + c, 16)) : [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const a = rgb(hex);
  const b = rgb(COLOURS.text);
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, "0")).join("")}`;
}

// ── what goes on each image ─────────────────────────────────────────────────
// Each card is one image. Its file is where it is written (relative to the site root) and
// `alt` is the og:image:alt text for every page that uses it.
export const guideImage = (guide) => `og/guides/${guide.id}.png`;
export const seriesImage = (series) => `og/${series.id}.png`;

export function shareCards({ site, series, guides }) {
  // The footer shows where the page lives, without the scheme or a trailing slash.
  const address = (path) => {
    const url = new URL(path, site.url);
    return `${url.host}${url.pathname.replace(/\/$/, "")}`;
  };
  const by = (title) => (title === site.title ? "By George Hanu." : `${site.title}, by George Hanu.`);
  const card = (c) => ({ ...c, address: address(c.path), alt: `${c.title}: ${c.description}. ${by(c.title)}` });

  const home = card({
    file: "og.png",
    path: "/",
    accent: DEFAULT_ACCENT,
    kicker: "George Hanu · free guides",
    title: site.title,
    description: site.og?.description ?? site.subtitle,
    meta: `${plural(guides.length, "guide")} · ${plural(lessonCount(guides), "lesson")}`,
  });
  const seriesCards = series.map((s) =>
    card({
      file: seriesImage(s),
      path: `/series/${s.id}/`,
      accent: s.guides[0].accent,
      kicker: `${site.title} · Series`,
      title: s.title,
      description: s.og?.description ?? s.blurb,
      meta: `${plural(s.guides.length, "guide")} · ${plural(lessonCount(s.guides), "lesson")}`,
    }),
  );
  const guideCards = guides.map((g) =>
    card({
      file: guideImage(g),
      path: g.url,
      accent: g.accent,
      kicker: `${site.title} · George Hanu`,
      title: g.title,
      description: g.og?.description ?? g.promise,
      meta: g.format,
    }),
  );
  return { home, series: seriesCards, guides: guideCards, all: [home, ...seriesCards, ...guideCards] };
}

// ── text measuring and fitting ──────────────────────────────────────────────
const measured = new Map();
async function widthAt100(text, weight) {
  const key = `${weight}|${text}`;
  if (!measured.has(key)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${text.length * 110 + 200}" height="160"><text x="40" y="120" font-family="${FONT}" font-size="100" font-weight="${weight}" fill="#fff">${esc(text)}</text></svg>`;
    const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true });
    measured.set(key, info.width);
  }
  return measured.get(key);
}

// The largest size (within `size`) at which the text fits `width` on one line; failing that,
// on two balanced lines (within `wrap`); failing that, two lines at the smallest wrap size,
// the second cut short with an ellipsis.
async function fit(text, { weight, width = TEXT_WIDTH, size: [max, min], wrap }) {
  const sizeFor = async (line) => Math.floor((width * 100) / (await widthAt100(line, weight)));
  const one = Math.min(max, await sizeFor(text));
  if (one >= min) return { size: one, lines: [text] };
  const words = text.split(" ");
  if (!wrap || words.length < 2) return { size: min, lines: [await cut(text, min)] };
  let best;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    const size = Math.min(await sizeFor(lines[0]), await sizeFor(lines[1]));
    if (!best || size > best.size) best = { size, lines };
  }
  if (best.size >= wrap[1]) return { size: Math.min(wrap[0], best.size), lines: best.lines };
  // Too long even for two lines: fill the first line, cut the second.
  let i = 1;
  while (i < words.length - 1 && (await sizeFor(words.slice(0, i + 1).join(" "))) >= wrap[1]) i++;
  return { size: wrap[1], lines: [words.slice(0, i).join(" "), await cut(words.slice(i).join(" "), wrap[1])] };

  async function cut(line, at) {
    if ((await sizeFor(line)) >= at) return line;
    while (line.length > 1 && (await sizeFor(`${line}…`)) < at) line = line.slice(0, -1).trimEnd();
    return `${line}…`;
  }
}

const svgText = (x, y, size, weight, fill, content, anchor = "start") =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(content)}</text>`;

// ── the layout ──────────────────────────────────────────────────────────────
// Returns the PNG as a Buffer.
export async function renderShareImage({ accent, kicker, title, description, address, meta }) {
  const t = await fit(title, { weight: 800, size: [96, 76], wrap: [84, 56] });
  const d = await fit(description, { weight: 400, size: [36, 36], wrap: [36, 28] });

  // Stack the mark, kicker, title and description from the top; the footer sits at the bottom.
  const titleLine = Math.round(t.size * 1.08);
  const descLine = Math.round(d.size * 1.35);
  let y = 0;
  const markY = y;
  const kickerY = (y += 6 + 50); // baseline
  const titleY = (y += 36 + Math.round(t.size * 0.73));
  const descY = (y += (t.lines.length - 1) * titleLine + Math.round(t.size * 0.27) + 36 + Math.round(d.size * 0.73));
  const bottom = y + (d.lines.length - 1) * descLine + Math.round(d.size * 0.27);
  const FOOTER_RULE = 520;
  // The stack starts at the same height on every image; only a very tall one moves up.
  const top = Math.max(48, Math.min(100, FOOTER_RULE - 40 - bottom));

  // The footer: the address on the left, the meta on the right, dropped if they would touch.
  const footerWidth = async (text) => ((await widthAt100(text, 500)) * 26) / 100;
  const showMeta = meta && (await footerWidth(address)) + (await footerWidth(meta)) + 40 <= TEXT_WIDTH;

  const mark = lift(accent);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${COLOURS.bg}"/>
  <rect x="${X}" y="${top + markY}" width="56" height="6" rx="3" fill="${mark}"/>
  ${svgText(X, top + kickerY, 28, 600, COLOURS.muted, kicker)}
  ${t.lines.map((l, n) => svgText(X, top + titleY + n * titleLine, t.size, 800, COLOURS.text, l)).join("\n  ")}
  ${d.lines.map((l, n) => svgText(X, top + descY + n * descLine, d.size, 400, COLOURS.soft, l)).join("\n  ")}
  <rect x="${X}" y="${FOOTER_RULE}" width="${TEXT_WIDTH}" height="2" fill="${COLOURS.line}"/>
  ${svgText(X, 572, 26, 500, COLOURS.muted, address)}
  ${showMeta ? svgText(WIDTH - X, 572, 26, 500, COLOURS.muted, meta, "end") : ""}
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
