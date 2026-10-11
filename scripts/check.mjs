// Checks every external link on the site, then warns when a title on the hub has drifted
// from the <title> of the page it points to. Broken links fail (exit 1); drift only warns.
//
//   npm run check    (builds first)

import { loadData } from "./data.mjs";

const { site, guides } = loadData();

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

// ── 2. titles on the hub still match the pages they link to ─────────────────
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", middot: "·", hellip: "…" };
const decode = (html) =>
  html.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? match;
    return String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
  });
// Lowercase, no quotes or punctuation, padded so that containment means whole words.
const words = (text) => ` ${text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

const titled = [
  ...guides.map((g) => ({ title: g.title, url: g.url })),
  ...guides.flatMap((g) => g.lessons.filter((l) => l.page).map((l) => ({ title: l.title, url: l.url }))),
];

const drift = await pool(titled, async (item) => {
  try {
    const res = await request(item.url, "GET");
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) {
      await res.body?.cancel();
      return { ...item, skipped: res.ok ? "not an HTML page" : `HTTP ${res.status}` };
    }
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(await res.text());
    if (!match) return { ...item, warn: "the page has no <title>" };
    const pageTitle = decode(match[1]).replace(/\s+/g, " ").trim();
    return words(pageTitle).includes(words(item.title)) ? { ...item } : { ...item, warn: `page title is "${pageTitle}"` };
  } catch (err) {
    return { ...item, skipped: reason(err) };
  }
});

const warnings = drift.filter((d) => d.warn);
const skipped = drift.filter((d) => d.skipped);
for (const d of warnings) console.log(`WARN title drift: hub says "${d.title}", ${d.warn} (${d.url})`);
for (const d of skipped) console.log(`skip title check (${d.skipped}): ${d.url}`);

console.log(
  `\nLinks: ${links.length - broken} ok, ${broken} broken. ` +
    `Titles: ${drift.length - skipped.length} compared, ${warnings.length} WARN${skipped.length ? `, ${skipped.length} skipped` : ""}.`,
);
if (broken) process.exit(1);
