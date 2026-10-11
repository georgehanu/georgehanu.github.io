// Checks the share images the build wrote and every og:image/twitter:image on the hub, then
// every external link on the site, then warns when a title on the hub has drifted from the
// <title> of the page it points to, or a guide page doesn't use its share image.
// Missing images and broken links fail (exit 1); drift only warns.
//
//   npm run check    (builds first)

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadData, root } from "./data.mjs";
import { guideImage, HEIGHT, seriesImage, WIDTH } from "./og.mjs";

const { site, series, guides } = loadData();

const LIMIT = 8; // requests in flight at once
const TIMEOUT = 20_000;
const headers = { "user-agent": "georgehanu.github.io link check" };

// Run `task` over `items`, at most LIMIT at a time, keeping the results in order.
async function pool(items, task) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(LIMIT, items.length) }, worker));
  return results;
}

const request = (url, method) => fetch(url, { method, headers, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) });
const reason = (err) => err.cause?.code ?? err.name ?? "error";
const isX = (url) => ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(new URL(url).hostname);
const absolute = (file) => new URL(file, site.url).href;
const metaImages = (html) =>
  [...html.matchAll(/<meta\s+(?:property|name)="(og:image|twitter:image)"\s+content="([^"]*)"/g)].map((m) => ({ tag: m[1], url: m[2] }));

// ── 0. the share images exist, and every hub page points at one ─────────────
const imageProblems = [];
const images = ["og.png", ...series.map(seriesImage), ...guides.map(guideImage)];
for (const file of images) {
  const full = join(root, file);
  if (!existsSync(full)) {
    imageProblems.push(`${file} was not built`);
    continue;
  }
  const png = readFileSync(full);
  const isPng = png.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  if (!isPng || png.readUInt32BE(16) !== WIDTH || png.readUInt32BE(20) !== HEIGHT) imageProblems.push(`${file} is not a ${WIDTH}×${HEIGHT} PNG`);
}
const hubPages = ["index.html", "lessons/index.html", "404.html", ...readdirSync(join(root, "series")).map((id) => `series/${id}/index.html`)];
for (const file of hubPages) {
  const found = metaImages(readFileSync(join(root, file), "utf8"));
  for (const tag of ["og:image", "twitter:image"]) if (!found.some((m) => m.tag === tag)) imageProblems.push(`${file} has no ${tag}`);
  for (const { tag, url } of found) {
    if (!url.startsWith(site.url)) imageProblems.push(`${file}: ${tag} ${url} is not an absolute URL on ${site.url}`);
    else if (!existsSync(join(root, url.slice(site.url.length)))) imageProblems.push(`${file}: ${tag} ${url} points to a file that wasn't built`);
  }
}
for (const problem of imageProblems) console.log(`BAD image: ${problem}`);
console.log(`Share images: ${images.length} built, ${hubPages.length} hub pages checked, ${imageProblems.length} problems.\n`);

// ── 1. every external link answers ──────────────────────────────────────────
const links = [
  ...new Set([site.x, site.github, ...guides.flatMap((g) => [g.url, g.code, ...g.lessons.filter((l) => l.page).map((l) => l.url)])]),
];

const statuses = await pool(links, async (url) => {
  let status;
  try {
    status = (await request(url, "HEAD")).status;
  } catch (err) {
    status = reason(err);
  }
  if (status === 405 || status === 403 || typeof status !== "number") {
    try {
      const res = await request(url, "GET");
      await res.body?.cancel();
      status = res.status;
    } catch (err) {
      status = reason(err);
    }
  }
  // x.com answers bots unpredictably, so only a 404 counts as broken there.
  const ok = isX(url) ? status !== 404 : typeof status === "number" && status >= 200 && status < 300;
  return { url, status, ok };
});

for (const { url, status, ok } of statuses) console.log(`${ok ? "ok " : "BAD"} ${status} ${url}`);
const broken = statuses.filter((s) => !s.ok).length;

// ── 2. titles on the hub still match the pages they link to; guide pages use their image ──
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", middot: "·", hellip: "…" };
const decode = (html) =>
  html.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? match;
    return String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
  });
// Lowercase, no quotes or punctuation, padded so that containment means whole words.
const words = (text) => ` ${text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

// A guide's index and lesson pages all share the guide's image, built here in og/guides/.
const titled = [
  ...guides.map((g) => ({ title: g.title, url: g.url, image: absolute(guideImage(g)) })),
  ...guides.flatMap((g) => g.lessons.filter((l) => l.page).map((l) => ({ title: l.title, url: l.url, image: absolute(guideImage(g)) }))),
];

const drift = await pool(titled, async (item) => {
  try {
    const res = await request(item.url, "GET");
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) {
      await res.body?.cancel();
      return { ...item, skipped: res.ok ? "not an HTML page" : `HTTP ${res.status}` };
    }
    const html = await res.text();
    const image = metaImages(html).find((m) => m.tag === "og:image")?.url;
    const imageWarn = image === item.image ? undefined : `og:image is ${image ?? "missing"}, expected ${item.image}`;
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (!match) return { ...item, imageWarn, warn: "the page has no <title>" };
    const pageTitle = decode(match[1]).replace(/\s+/g, " ").trim();
    return words(pageTitle).includes(words(item.title)) ? { ...item, imageWarn } : { ...item, imageWarn, warn: `page title is "${pageTitle}"` };
  } catch (err) {
    return { ...item, skipped: reason(err) };
  }
});

const warnings = drift.filter((d) => d.warn);
const imageWarnings = drift.filter((d) => d.imageWarn);
const skipped = drift.filter((d) => d.skipped);
for (const d of warnings) console.log(`WARN title drift: hub says "${d.title}", ${d.warn} (${d.url})`);
for (const d of imageWarnings) console.log(`WARN share image: ${d.imageWarn} (${d.url})`);
for (const d of skipped) console.log(`skip title check (${d.skipped}): ${d.url}`);

console.log(
  `\nImages: ${imageProblems.length} problems. Links: ${links.length - broken} ok, ${broken} broken. ` +
    `Titles: ${drift.length - skipped.length} compared, ${warnings.length} WARN${skipped.length ? `, ${skipped.length} skipped` : ""}. ` +
    `Guide share images: ${imageWarnings.length} WARN.`,
);
if (broken || imageProblems.length) process.exit(1);
