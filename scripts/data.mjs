// Reads data/site.json and data/guides/*.json, checks them, and returns the model that
// scripts/build.mjs and scripts/check.mjs both work from. If anything is wrong it stops
// with the complete list of problems, so one pass over the data fixes everything.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));

const MAX_TOPICS = 3;
const isText = (value) => typeof value === "string" && value.trim() !== "";
const isSlug = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const isColour = (value) => typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
const isWebUrl = (value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
const isDate = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === "string" ? value : "");
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
// A lesson page is relative to its guide's url: no scheme ("https:", "mailto:") and no leading slash.
const isAbsolute = (page) => /^[a-z][a-z0-9+.-]*:/i.test(page) || /^[/\\]/.test(page);
const show = (value) => (value === undefined ? "missing" : JSON.stringify(value));
// Optional share-image words: { "og": { "description": "…" } }. Without it the image uses the
// blurb (series), the promise (guide) or the subtitle (site).
const OG_KEYS = ["description"];
function ogProblems(og, where) {
  if (og === undefined) return [];
  if (typeof og !== "object" || og === null || Array.isArray(og)) return [`${where}: og must be an object like { "description": "…" }`];
  return [
    ...Object.keys(og).filter((key) => !OG_KEYS.includes(key)).map((key) => `${where}: og.${key} is not a known field (use ${OG_KEYS.join(", ")})`),
    ...(og.description !== undefined && !isText(og.description) ? [`${where}: og.description must be a short text`] : []),
  ];
}

export function loadData() {
  const problems = [];
  const read = (file) => {
    try {
      return JSON.parse(readFileSync(join(root, file), "utf8"));
    } catch (err) {
      problems.push(`${file}: ${err.code === "ENOENT" ? "file not found" : err.message}`);
      return null;
    }
  };
  const list = (value, where) => {
    if (Array.isArray(value)) return value;
    problems.push(`${where} must be a list`);
    return [];
  };

  // ── data/site.json ────────────────────────────────────────────────────────
  const raw = read("data/site.json");
  const siteRead = raw !== null;
  const site = raw?.site ?? {};
  if (siteRead) {
    for (const key of ["title", "subtitle", "pitch"]) if (!isText(site[key])) problems.push(`data/site.json: site.${key} is missing`);
    for (const key of ["url", "x", "github"]) if (!isWebUrl(site[key])) problems.push(`data/site.json: site.${key} must be an http(s) URL`);
    if (isWebUrl(site.url) && !site.url.endsWith("/")) problems.push('data/site.json: site.url must end with "/"');
    problems.push(...ogProblems(site.og, "data/site.json: site"));
  }

  const topicById = new Map();
  const topics = siteRead ? list(raw.topics, "data/site.json: topics") : [];
  topics.forEach((topic, i) => {
    const where = `data/site.json: topics[${i}]`;
    if (!isSlug(topic?.id)) problems.push(`${where}: id ${show(topic?.id)} must be lowercase-with-dashes`);
    else if (topicById.has(topic.id)) problems.push(`${where}: duplicate topic id "${topic.id}"`);
    else topicById.set(topic.id, topic);
    if (!isText(topic?.label)) problems.push(`${where}: label is missing`);
  });

  // ── data/guides/*.json ────────────────────────────────────────────────────
  let files = [];
  try {
    files = readdirSync(join(root, "data/guides")).filter((name) => name.endsWith(".json")).sort();
  } catch {
    problems.push("data/guides/: folder not found");
  }
  if (!files.length) problems.push("data/guides/: there are no guide files");

  const byId = new Map();
  for (const name of files) {
    const file = `data/guides/${name}`;
    const guide = read(file);
    if (guide === null) continue;
    const expected = name.slice(0, -".json".length);
    if (guide.id !== expected) problems.push(`${file}: id must equal the file name "${expected}" (it is ${show(guide.id)})`);
    for (const key of ["title", "promise", "format", "level"]) if (!isText(guide[key])) problems.push(`${file}: ${key} is missing`);
    for (const key of ["url", "code"]) if (!isWebUrl(guide[key])) problems.push(`${file}: ${key} must be an http(s) URL (it is ${show(guide[key])})`);
    if (!Array.isArray(guide.facts) || !guide.facts.every(isText)) problems.push(`${file}: facts must be a list of short texts`);
    if (!isColour(guide.accent)) problems.push(`${file}: accent must be a hex colour like "#0f766e" (it is ${show(guide.accent)})`);
    problems.push(...ogProblems(guide.og, file));
    if (!isDate(guide.published)) problems.push(`${file}: published must be a real date written YYYY-MM-DD (it is ${show(guide.published)})`);

    const lessons = Array.isArray(guide.lessons) ? guide.lessons : [];
    if (!lessons.length) problems.push(`${file}: lessons must be a list with at least one lesson`);
    const titles = new Set();
    lessons.forEach((lesson, i) => {
      const where = `${file}: lesson ${i + 1}${isText(lesson?.title) ? ` "${lesson.title}"` : ""}`;
      if (!isText(lesson?.title)) problems.push(`${where}: title is missing`);
      else if (titles.has(lesson.title.trim().toLowerCase())) problems.push(`${where}: another lesson in this guide has the same title`);
      else titles.add(lesson.title.trim().toLowerCase());
      if (lesson?.page !== undefined) {
        if (!isText(lesson.page)) problems.push(`${where}: page must be a file name like "01-intro.html"`);
        else if (isAbsolute(lesson.page)) problems.push(`${where}: page "${lesson.page}" must be relative to the guide url (no scheme, no leading slash)`);
      }
      const ids = Array.isArray(lesson?.topics) ? lesson.topics : [];
      if (ids.length < 1 || ids.length > MAX_TOPICS) problems.push(`${where}: needs 1 to ${MAX_TOPICS} topics (it has ${ids.length})`);
      if (new Set(ids).size !== ids.length) problems.push(`${where}: lists the same topic twice`);
      if (topicById.size) for (const id of ids) if (!topicById.has(id)) problems.push(`${where}: unknown topic ${show(id)}`);
    });

    if (!isText(guide.id)) continue;
    if (byId.has(guide.id)) problems.push(`${file}: duplicate guide id "${guide.id}" (also in ${byId.get(guide.id).file})`);
    else byId.set(guide.id, { ...guide, file });
  }

  // ── series and start, which point at guides ───────────────────────────────
  const seriesData = siteRead ? list(raw.series, "data/site.json: series") : [];
  if (siteRead && Array.isArray(raw.series) && !seriesData.length) problems.push("data/site.json: series must have at least one series");
  const seriesIds = new Set();
  const memberOf = new Map(); // guide id → ids of the series that list it
  seriesData.forEach((series, i) => {
    const where = `data/site.json: series ${isText(series?.id) ? `"${series.id}"` : `#${i + 1}`}`;
    if (!isSlug(series?.id)) problems.push(`${where}: id must be lowercase-with-dashes`);
    else if (seriesIds.has(series.id)) problems.push(`${where}: duplicate series id`);
    else seriesIds.add(series.id);
    for (const key of ["title", "blurb"]) if (!isText(series?.[key])) problems.push(`${where}: ${key} is missing`);
    problems.push(...ogProblems(series?.og, where));
    const ids = Array.isArray(series?.guides) ? series.guides : [];
    if (!ids.length) problems.push(`${where}: guides must list at least one guide id`);
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`${where}: lists guide "${id}" twice`);
      else if (!byId.has(id)) problems.push(`${where}: lists unknown guide ${show(id)}`);
      else memberOf.set(id, [...(memberOf.get(id) ?? []), series.id ?? `#${i + 1}`]);
      seen.add(id);
    }
  });
  if (siteRead) {
    for (const id of byId.keys()) {
      const homes = memberOf.get(id) ?? [];
      if (!homes.length) problems.push(`guide "${id}" is not in any series (add its id to one in data/site.json)`);
      if (homes.length > 1) problems.push(`guide "${id}" is in ${homes.length} series (${homes.join(", ")}); a guide belongs to exactly one`);
    }
  }

  const start = siteRead ? list(raw.start, "data/site.json: start") : [];
  start.forEach((path, i) => {
    const where = `data/site.json: start[${i}]`;
    if (!isText(path?.if) || !isText(path?.then)) problems.push(`${where}: needs "if" and "then" texts`);
    if (!byId.has(path?.guide)) problems.push(`${where}: points to unknown guide ${show(path?.guide)}`);
  });

  if (problems.length) {
    console.error(`The data has ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }

  // ── the model: series in order, each guide knows its series and part ──────
  const series = seriesData.map((s) => {
    const guides = s.guides.map((id, i) => {
      const guide = byId.get(id);
      guide.part = i + 1;
      guide.lessons = guide.lessons.map((lesson) => ({
        ...lesson,
        url: lesson.page ? new URL(lesson.page, guide.url).href : guide.url,
        topics: lesson.topics.map((topicId) => topicById.get(topicId)),
      }));
      return guide;
    });
    const result = { id: s.id, title: s.title, blurb: s.blurb, og: s.og, guides };
    for (const guide of guides) guide.series = result;
    return result;
  });

  return {
    site,
    topics,
    series,
    guides: series.flatMap((s) => s.guides),
    start: start.map((path) => ({ ...path, guide: byId.get(path.guide) })),
  };
}
