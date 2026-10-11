// Builds the whole site from data/: every page, sitemap.xml, robots.txt and the share images.
//
//   npm run build    build everything
//   npm run check    build, then check every link (scripts/check.mjs)
//
// Generated (never edit by hand): index.html, lessons/, series/, 404.html, sitemap.xml,
// robots.txt, og.png, og/. Hand-written: data/, scripts/, style.css, favicon.svg.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadData, root } from "./data.mjs";
import { renderShareImage, seriesImage, shareCards } from "./og.mjs";

const { site, topics, series, guides, start } = loadData();
const cards = shareCards({ site, series, guides }); // the share images: what each says, and its alt text

const LATEST_FROM = 5; // the home page gets a "Latest" section once there are this many guides

// ── helpers ─────────────────────────────────────────────────────────────────
const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const lessonCount = (list) => list.reduce((n, g) => n + g.lessons.length, 0);
const counts = (list) => `${plural(list.length, "guide")} · ${plural(lessonCount(list), "lesson")}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
const newest = (list) => list.map((g) => g.published).sort().at(-1);
const absolute = (path) => new URL(path.replace(/^\//, ""), site.url).href;
const seriesPath = (s) => `/series/${s.id}/`;
const handle = "@" + new URL(site.x).pathname.split("/").filter(Boolean)[0];
const arrow = '<span aria-hidden="true">→</span>';

// ── layout shared by every page ─────────────────────────────────────────────
// A page without its own share image gets the home one, /og.png.
function page({ path, title, socialTitle = title, description, image = "/og.png", imageAlt = cards.home.alt, main, script = "", noindex = false }) {
  const url = absolute(path);
  const img = absolute(image);
  const here = (href) => (href === path ? ' aria-current="page"' : "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.title)}">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(socialTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="${handle}">
<meta name="twitter:creator" content="${handle}">
<meta name="twitter:title" content="${esc(socialTitle)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${img}">
<meta name="twitter:image:alt" content="${esc(imageAlt)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <a class="brand" href="/"${here("/")}>George Hanu <span>· ${esc(site.title)}</span></a>
  <nav aria-label="Main">
    <a href="/lessons/"${here("/lessons/")}>All lessons</a>
    <a class="github" href="${esc(site.github)}">GitHub</a>
    <a class="follow" href="${esc(site.x)}">Follow on X</a>
  </nav>
</header>

<main id="main">
${main}
</main>

<footer class="foot">
  <nav class="foot-nav" aria-label="Series and lessons">
    ${series.map((s) => `<a href="${seriesPath(s)}"${here(seriesPath(s))}>${esc(s.title)}</a>`).join("\n    ")}
    <a href="/lessons/"${here("/lessons/")}>All lessons</a>
  </nav>
  <p>All guides are free and open on <a href="${esc(site.github)}">GitHub</a>. Code is MIT licensed.</p>
</footer>
${script}</body>
</html>
`;
}

// ── home ────────────────────────────────────────────────────────────────────
const card = ({ href, accent, title, text, foot }) => `<a class="path" href="${esc(href)}" style="--accent:${accent}">
        <span class="if">${esc(title)}</span>
        <span class="then">${esc(text)}</span>
        <span class="go">${foot}</span>
      </a>`;

const startHere = `<section class="start" aria-labelledby="start-title">
    <h2 id="start-title">Start here</h2>
    <div class="paths">
      ${start.map((p) => card({ href: p.guide.url, accent: p.guide.accent, title: p.if, text: p.then, foot: `${esc(p.guide.title)} →` })).join("\n      ")}
    </div>
  </section>`;

// Newest first; guides published the same day keep their series order.
const latestGuides = guides.length >= LATEST_FROM ? [...guides].sort((a, b) => b.published.localeCompare(a.published)).slice(0, 3) : [];
const latest = latestGuides.length
  ? `<section class="latest" aria-labelledby="latest-title">
    <h2 id="latest-title">Latest</h2>
    <div class="paths">
      ${latestGuides.map((g) => card({ href: g.url, accent: g.accent, title: g.title, text: g.promise, foot: `${month(g.published)} · ${esc(g.series.title)}` })).join("\n      ")}
    </div>
  </section>`
  : "";

const seriesCard = (s) => `<article class="series-card">
      <div class="series-card-head">
        <h3><a href="${seriesPath(s)}">${esc(s.title)}</a></h3>
        <p>${esc(s.blurb)}</p>
        <p class="count">${counts(s.guides)}</p>
      </div>
      <ol class="guide-rows">
        ${s.guides.map((g) => `<li class="guide-row" style="--accent:${g.accent}">
          <div class="guide-row-top"><a href="${esc(g.url)}">${esc(g.title)}</a><span>${plural(g.lessons.length, "lesson")} · ${month(g.published)}</span></div>
          <p>${esc(g.promise)}</p>
        </li>`).join("\n        ")}
      </ol>
      <a class="more" href="${seriesPath(s)}">Browse the series<span class="sr-only">: ${esc(s.title)}</span> ${arrow}</a>
    </article>`;

const home = page({
  path: "/",
  title: `${site.title} · George Hanu`,
  socialTitle: `${site.title} · ${site.subtitle}`,
  description: `${site.pitch} ${plural(guides.length, "free guide")}, ${plural(lessonCount(guides), "lesson")}.`,
  main: [
    `  <section class="hero">
    <p class="eyebrow">${esc(site.subtitle)}</p>
    <h1>${esc(site.title)}</h1>
    <p class="pitch">${esc(site.pitch)}</p>
    <p class="count">${counts(guides)} · free, no signup</p>
  </section>`,
    startHere,
    latest,
    `<section class="series-list" aria-labelledby="series-title">
    <div class="series-head">
      <h2 id="series-title">Series</h2>
      <p>Each series reads in order. Or <a href="/lessons/">browse all ${plural(lessonCount(guides), "lesson")} by topic</a>.</p>
    </div>
    <div class="series-cards">
    ${series.map(seriesCard).join("\n    ")}
    </div>
  </section>`,
    `<section class="about" aria-labelledby="about-title">
    <h2 id="about-title">Hi, I'm George.</h2>
    <p>I'm a senior web developer. I build with AI every day and write down what works: small examples you can run, explained clearly.
      I post one practical idea most days on X.</p>
    <a class="btn primary" href="${esc(site.x)}">Follow ${handle}</a>
  </section>`,
  ]
    .filter(Boolean)
    .join("\n\n  "),
});

// ── series pages ────────────────────────────────────────────────────────────
const guideCard = (g) => `<article class="guide" id="${g.id}" style="--accent:${g.accent}">
      <div class="guide-head">
        <span class="format">${esc(g.format)}</span>
        <h2><span class="part">Part ${g.part} ·</span> <a href="${esc(g.url)}">${esc(g.title)}</a></h2>
        <p>${esc(g.promise)}</p>
      </div>
      <ul class="facts">${[...g.facts, g.level].map((fact) => `<li>${esc(fact)}</li>`).join("")}</ul>
      <ol class="toc">
        ${g.lessons.map((l) => `<li><a href="${esc(l.url)}">${esc(l.title)}</a></li>`).join("\n        ")}
      </ol>
      <div class="guide-links">
        <a class="btn primary" href="${esc(g.url)}">Read it<span class="sr-only">: ${esc(g.title)}</span></a>
        <a class="btn" href="${esc(g.code)}">Code on GitHub<span class="sr-only">: ${esc(g.title)}</span></a>
      </div>
    </article>`;

function seriesPage(s) {
  const share = cards.series.find((c) => c.file === seriesImage(s));
  const others = series.filter((other) => other !== s);
  const more = others.length
    ? `

  <section class="more-series" aria-labelledby="more-title">
    <h2 id="more-title">More series</h2>
    <div class="paths">
      ${others.map((o) => card({ href: seriesPath(o), accent: o.guides[0].accent, title: o.title, text: o.blurb, foot: `${counts(o.guides)} →` })).join("\n      ")}
    </div>
  </section>`
    : "";
  return page({
    path: seriesPath(s),
    title: `${s.title} · ${site.title}`,
    description: `${s.blurb} ${plural(s.guides.length, "free guide")}, ${plural(lessonCount(s.guides), "lesson")}, by George Hanu.`,
    image: `/${share.file}`,
    imageAlt: share.alt,
    main: `  <nav class="crumbs" aria-label="Breadcrumb">
    <ol><li><a href="/">Home</a></li><li aria-current="page">${esc(s.title)}</li></ol>
  </nav>

  <section class="hero">
    <p class="eyebrow">Series</p>
    <h1>${esc(s.title)}</h1>
    <p class="pitch">${esc(s.blurb)}</p>
    <p class="count">${counts(s.guides)} · free, no signup</p>
  </section>

  <section class="guides" aria-label="Guides in this series">
    ${s.guides.map(guideCard).join("\n    ")}
  </section>${more}`,
  });
}

// ── all lessons ─────────────────────────────────────────────────────────────
const searchText = (lesson, guide) =>
  [lesson.title, guide.title, ...lesson.topics.map((t) => t.label)].join(" ").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

const lessonGroup = (g) => `<section class="lesson-group" data-series="${g.series.id}" style="--accent:${g.accent}" aria-labelledby="guide-${g.id}">
      <div class="group-head">
        <h2 id="guide-${g.id}"><a href="${esc(g.url)}">${esc(g.title)}</a></h2>
        <p><a href="${seriesPath(g.series)}">${esc(g.series.title)}</a> · Part ${g.part}</p>
      </div>
      <ul class="lesson-list">
        ${g.lessons.map((l) => `<li data-topics="${l.topics.map((t) => t.id).join(" ")}" data-text="${esc(searchText(l, g))}">
          <a href="${esc(l.url)}">${esc(l.title)}</a>
          <span class="lesson-topics"><span class="sr-only">Topics:</span>${l.topics.map((t) => `<span>${esc(t.label)}</span>`).join("")}</span>
        </li>`).join("\n        ")}
      </ul>
    </section>`;

// Runs in the browser on /lessons/. Without JavaScript the full list is simply shown.
function lessonFilters() {
  const form = document.getElementById("filters");
  const search = document.getElementById("q");
  const select = document.getElementById("series");
  const count = document.getElementById("count");
  const empty = document.getElementById("empty");
  const chips = [...form.querySelectorAll(".chip")];
  const groups = [...document.querySelectorAll(".lesson-group")];
  const total = document.querySelectorAll(".lesson-group li").length;
  const topicIds = chips.map((chip) => chip.dataset.topic);
  const seriesIds = [...select.options].map((option) => option.value);
  const clean = (text) => text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  let topic = "";

  // The filter lives in the hash (#q=…&series=…&topic=…), so a filtered view can be shared.
  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    search.value = params.get("q") || "";
    select.value = seriesIds.includes(params.get("series")) ? params.get("series") : "";
    topic = topicIds.includes(params.get("topic")) ? params.get("topic") : "";
  }

  function writeHash() {
    const params = new URLSearchParams();
    if (search.value.trim()) params.set("q", search.value.trim());
    if (select.value) params.set("series", select.value);
    if (topic) params.set("topic", topic);
    const hash = params.toString();
    history.replaceState(null, "", hash ? `#${hash}` : location.pathname + location.search);
  }

  function apply() {
    const words = clean(search.value).split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const group of groups) {
      const inSeries = !select.value || group.dataset.series === select.value;
      let visible = 0;
      for (const row of group.querySelectorAll("li")) {
        const match =
          inSeries &&
          (!topic || row.dataset.topics.split(" ").includes(topic)) &&
          words.every((word) => row.dataset.text.includes(word));
        row.hidden = !match;
        if (match) visible++;
      }
      group.hidden = visible === 0;
      shown += visible;
    }
    for (const chip of chips) chip.setAttribute("aria-pressed", String(chip.dataset.topic === topic));
    count.textContent = `Showing ${shown} of ${total} lesson${total === 1 ? "" : "s"}`;
    empty.hidden = shown > 0;
  }

  function update() {
    apply();
    writeHash();
  }

  form.hidden = false;
  form.addEventListener("submit", (event) => event.preventDefault());
  search.addEventListener("input", update);
  select.addEventListener("change", update);
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      topic = chip.dataset.topic === topic ? "" : chip.dataset.topic;
      update();
    });
  }
  document.getElementById("reset").addEventListener("click", () => {
    search.value = "";
    select.value = "";
    topic = "";
    update();
    search.focus();
  });
  window.addEventListener("hashchange", () => {
    readHash();
    apply();
  });
  readHash();
  apply();
}

const totalLessons = lessonCount(guides);
const lessonsPage = page({
  path: "/lessons/",
  title: `All lessons · ${site.title}`,
  description: `Every lesson from George Hanu's free guides on coding with AI, in one list: ${plural(totalLessons, "lesson")} from ${plural(guides.length, "guide")}. Search, or filter by series and topic.`,
  main: `  <section class="hero">
    <p class="eyebrow">${esc(site.subtitle)}</p>
    <h1>All lessons</h1>
    <p class="pitch">Every lesson from every guide, in one list. Search, or filter by series and topic.</p>
  </section>

  <section class="lessons" aria-label="Lessons">
    <form class="filters" id="filters" role="search" aria-label="Filter lessons" hidden>
      <div class="filter-row">
        <label class="sr-only" for="q">Search lessons</label>
        <input class="search" id="q" type="search" placeholder="Search lessons…" autocomplete="off">
        <label class="sr-only" for="series">Series</label>
        <select class="select" id="series">
          <option value="">All series</option>
          ${series.map((s) => `<option value="${s.id}">${esc(s.title)}</option>`).join("\n          ")}
        </select>
      </div>
      <div class="chips" role="group" aria-label="Topic">
        <button class="chip" type="button" data-topic="" aria-pressed="true">All</button>
        ${topics.map((t) => `<button class="chip" type="button" data-topic="${t.id}" aria-pressed="false">${esc(t.label)}</button>`).join("\n        ")}
      </div>
    </form>
    <p class="count" id="count" aria-live="polite">Showing ${totalLessons} of ${plural(totalLessons, "lesson")}</p>
    <div class="lesson-groups">
    ${guides.map(lessonGroup).join("\n    ")}
    </div>
    <div class="empty" id="empty" hidden>
      <p>No lessons match these filters.</p>
      <button class="btn" id="reset" type="button">Show all lessons</button>
    </div>
  </section>`,
  script: `<script>\n(${lessonFilters})();\n</script>\n`,
});

// ── 404 ─────────────────────────────────────────────────────────────────────
const notFound = page({
  path: "/404.html",
  title: `Page not found · ${site.title}`,
  description: `That page doesn't exist. Every free guide and lesson on ${site.title} is one click away.`,
  noindex: true,
  main: `  <section class="hero">
    <p class="eyebrow">404</p>
    <h1>Page not found</h1>
    <p class="pitch">That page doesn't exist, or it moved. Everything is still one click away.</p>
    <p class="actions"><a class="btn primary" href="/">Go to the home page</a> <a class="btn" href="/lessons/">Browse all lessons</a></p>
  </section>`,
});

// ── sitemap and robots ──────────────────────────────────────────────────────
const sitemapEntries = [
  { path: "/", lastmod: newest(guides) },
  { path: "/lessons/", lastmod: newest(guides) },
  ...series.map((s) => ({ path: seriesPath(s), lastmod: newest(s.guides) })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.map((e) => `  <url><loc>${esc(absolute(e.path))}</loc><lastmod>${e.lastmod}</lastmod></url>`).join("\n")}
</urlset>
`;
const robots = `User-agent: *
Allow: /

Sitemap: ${absolute("/sitemap.xml")}
`;

// ── write the pages ─────────────────────────────────────────────────────────
const written = [];
function write(file, content) {
  const full = join(root, file);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  written.push(file);
}

// series/ and og/ are fully generated: start them fresh so a removed series leaves nothing behind.
rmSync(join(root, "series"), { recursive: true, force: true });
rmSync(join(root, "og"), { recursive: true, force: true });

write("index.html", home);
write("lessons/index.html", lessonsPage);
for (const s of series) write(`series/${s.id}/index.html`, seriesPage(s));
write("404.html", notFound);
write("sitemap.xml", sitemap);
write("robots.txt", robots);
write(".nojekyll", "");

// ── share images (1200×630) ─────────────────────────────────────────────────
// One template for all of them, in scripts/og.mjs: og.png, og/<series>.png, og/guides/<guide>.png.
// The guide sites point their og:image at the og/guides/ files, so keep those paths stable.
for (const share of cards.all) write(share.file, await renderShareImage(share));

const pages = written.filter((f) => f.endsWith(".html")).length;
const images = written.filter((f) => f.endsWith(".png")).length;
console.log(
  `Built ${series.length} series, ${plural(guides.length, "guide")}, ${plural(totalLessons, "lesson")}: ` +
    `wrote ${written.length} files (${pages} pages, ${images} share images, sitemap.xml, robots.txt, .nojekyll).`,
);
