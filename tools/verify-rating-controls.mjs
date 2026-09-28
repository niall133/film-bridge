// Optional browser regression check: node tools/verify-rating-controls.mjs [path-to-playwright]
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || "playwright");
const Shared = require("../src/shared.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.FILM_BRIDGE_CHROME_PATH ? { executablePath: process.env.FILM_BRIDGE_CHROME_PATH } : {})
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const data = {};
const errors = [];
const grantedOrigins = new Set();
let requests = 0;

await context.exposeBinding("bridgeStorageGet", async (_, keys) => {
  const wanted = keys == null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
  return Object.fromEntries(wanted.filter((key) => key in data).map((key) => [key, data[key]]));
});
async function store(items) {
  const changes = {};
  for (const [key, value] of Object.entries(items)) {
    changes[key] = { oldValue: data[key], newValue: value };
    data[key] = structuredClone(value);
  }
  await Promise.all(context.pages().map((page) => page.evaluate((changes) => {
    for (const listener of window.bridgeStorageListeners ?? []) listener(changes, "local");
  }, changes)));
}
await context.exposeBinding("bridgeStorageSet", async (_, items) => store(items));
await context.exposeBinding("bridgeStorageRemove", async (_, keys) => {
  const changes = {};
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    changes[key] = { oldValue: data[key] };
    delete data[key];
  }
  await Promise.all(context.pages().map((page) => page.evaluate((changes) => {
    for (const listener of window.bridgeStorageListeners ?? []) listener(changes, "local");
  }, changes)));
});
await context.exposeBinding("bridgeContainsPermission", (_, details) => details.origins.every((origin) => grantedOrigins.has(origin)));
await context.exposeBinding("bridgeRequestPermission", (_, details) => {
  for (const origin of details.origins) grantedOrigins.add(origin);
  return true;
});
await context.exposeBinding("bridgeRemovePermission", (_, details) => {
  for (const origin of details.origins) grantedOrigins.delete(origin);
  return true;
});
await context.exposeBinding("bridgeRuntimeRequest", () => { requests += 1; });
await context.addInitScript(() => {
  window.bridgeStorageListeners = [];
  window.bridgePendingResponses = [];
  window.chrome = {
    storage: {
      local: {
        get: (keys) => window.bridgeStorageGet(keys),
        set: (items) => window.bridgeStorageSet(items),
        remove: (keys) => window.bridgeStorageRemove(keys)
      },
      onChanged: { addListener: (listener) => window.bridgeStorageListeners.push(listener) }
    },
    permissions: {
      contains: (details, callback) => window.bridgeContainsPermission(details).then(callback),
      request: (details, callback) => window.bridgeRequestPermission(details).then(callback),
      remove: (details, callback) => window.bridgeRemovePermission(details).then(callback)
    },
    runtime: {
      id: "film-bridge-regression-test",
      sendMessage: async (message, callback) => {
        await window.bridgeRuntimeRequest();
        const deliver = async () => {
          const stored = await window.bridgeStorageGet("filmBridge.settings.v1");
          const settings = stored["filmBridge.settings.v1"];
          const ratings = {
            douban: { value: 9.4, max: 10 },
            letterboxd: { value: 4.3, max: 5 },
            imdb: { value: 8.8, max: 10, url: "https://www.imdb.com/title/tt1375666/" },
            tmdb: { value: 8.4, max: 10, url: "https://www.themoviedb.org/movie/27205" },
            metacritic: { value: 74, max: 100, url: "https://www.imdb.com/title/tt1375666/criticreviews/" }
          };
          if (window.bridgeApiUnavailable) {
            delete ratings.imdb; delete ratings.tmdb; delete ratings.metacritic;
          }
          callback({ ok: true, settings, ratings, configured: {}, target: {
            url: message.payload.source === "douban" ? "https://letterboxd.com/film/inception/" : "https://movie.douban.com/subject/3541415/"
          } });
        };
        if (window.bridgeHoldResponses) window.bridgePendingResponses.push(deliver);
        else await deliver();
      }
    }
  };
});

const sitePages = [
  ["douban", "https://movie.douban.com/subject/3541415/"],
  ["letterboxd", "https://letterboxd.com/film/inception/"],
  ["imdb", "https://www.imdb.com/title/tt1375666/"],
  ["imdb", "https://www.imdb.com/title/tt1375666/criticreviews/"],
  ["tmdb", "https://www.themoviedb.org/movie/27205-inception"],
  ["metacritic", "https://www.metacritic.com/movie/inception/"]
];
function fixture(site, url) {
  const body = site === "douban"
    ? '<div id="content"><h1><span property="v:itemreviewed">盗梦空间 Inception</span><span class="year">(2010)</span></h1><div id="original">原网页内容</div><div id="info">IMDb: tt1375666</div><div id="interest_sectl"><span property="v:average">9.4</span><span property="v:votes">10000</span></div></div>'
    : site === "letterboxd"
      ? '<main><div class="production-masthead"><h1 class="headline-1 primaryname"><span class="name">Inception</span></h1></div><div id="original">原网页内容</div></main>'
      : '<main><h1 data-testid="hero__pageTitle">Inception</h1><div id="original">原网页内容</div><span data-testid="metascore">74</span></main>';
  return `<!doctype html><html><head><style>body{margin:40px;font:20px Arial}h1{margin:0 0 20px}#original{height:50px;background:#ddd}</style><script type="application/ld+json">${JSON.stringify({
    "@type": "Movie", name: "Inception", url, datePublished: "2010-07-16", dateCreated: "2010-07-16", aggregateRating: { ratingValue: site === "letterboxd" ? 4.3 : 8.8, ratingCount: 10000 }
  })}</script></head><body data-tmdb-id="27205">${body}<a href="https://www.imdb.com/title/tt1375666/">IMDb</a></body></html>`;
}
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === "film-bridge.test") {
    const file = path.join(root, "src", path.basename(url.pathname));
    const body = await readFile(file);
    const contentType = url.pathname.endsWith(".js") ? "text/javascript" : url.pathname.endsWith(".css") ? "text/css" : "text/html";
    await route.fulfill({ body, contentType });
    return;
  }
  const source = sitePages.find(([, address]) => address === url.href)?.[0];
  await route.fulfill({ body: source ? fixture(source, url.href) : "", contentType: "text/html" });
});

async function filmPage(site, url) {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  for (const script of ["shared.js", "widget-styles.js", "content.js"]) {
    await page.addScriptTag({ path: path.join(root, "src", script) });
  }
  return page;
}
async function snapshot(page) {
  return page.evaluate(() => {
    const host = document.getElementById("film-bridge-extension-root");
    const shadow = host?.shadowRoot;
    return {
      shown: Boolean(host && getComputedStyle(host).display !== "none"),
      height: host?.getBoundingClientRect().height ?? 0,
      y: document.getElementById("original").getBoundingClientRect().top,
      cards: [...(shadow?.querySelectorAll(".rating") ?? [])].filter((node) => !node.hidden).map((node) => node.dataset.rating),
      count: document.querySelectorAll("#film-bridge-extension-root").length
    };
  });
}
const off = Shared.changeRatingControls({}, { type: "all", enabled: false });

try {
  for (const [site, url] of sitePages) {
    await store({ [Shared.SETTINGS_KEY]: off });
    const beforeRequests = requests;
    const page = await filmPage(site, url);
    await page.waitForTimeout(220);
    const baseline = await snapshot(page);
    assert.equal(baseline.shown, false, `${site} all-off at first load`);
    assert.equal(baseline.count, 0);
    assert.equal(requests, beforeRequests, "initial all-off must not request resolution");
    await store({ [Shared.SETTINGS_KEY]: Shared.changeRatingControls(off, { type: "all", enabled: true }) });
    await page.waitForFunction(() => document.querySelectorAll("#film-bridge-extension-root").length === 1 && document.querySelector("#film-bridge-extension-root").shadowRoot.querySelectorAll('.rating:not([hidden])').length === 5);
    assert.equal((await snapshot(page)).shown, true);
    await store({ [Shared.SETTINGS_KEY]: off });
    const collapsed = await snapshot(page);
    assert.equal(collapsed.shown, false);
    assert.equal(collapsed.height, 0);
    assert.equal(collapsed.y, baseline.y, `${site} original content position restored`);
    await page.evaluate(() => document.body.append(document.createElement("p")));
    await page.waitForTimeout(250);
    assert.equal((await snapshot(page)).shown, false, "DOM mutation must not reopen the card");
    await page.close();
  }

  const options = await context.newPage();
  await store({
    [Shared.SETTINGS_KEY]: { ...off, openInNewTab: false, cacheHours: 72 },
    "filmBridge.credentials.v1": { omdbApiKey: "test-key-never-saved-by-a-display-toggle" }
  });
  options.on("pageerror", (error) => errors.push(error.message));
  await options.goto("https://film-bridge.test/options.html");
  await options.waitForFunction(() => !document.getElementById("show-ratings").disabled);
  const page = await filmPage(...sitePages[0]);
  const baseline = await snapshot(page);
  await options.click("#enable-all-ratings");
  await page.waitForFunction(() => !document.getElementById("film-bridge-extension-root")?.hidden);
  await options.click("#disable-all-ratings");
  await options.waitForFunction(() => document.getElementById("status").className === "success");
  assert.equal((await snapshot(page)).height, 0);
  assert.equal((await snapshot(page)).y, baseline.y);
  assert.equal(await options.locator("#show-ratings").isChecked(), false);
  assert.equal(await options.locator("#rating-visibility-controls").getAttribute("data-all-off"), "true");
  assert.equal(data[Shared.SETTINGS_KEY].cacheHours, 72);
  assert.equal(data[Shared.SETTINGS_KEY].openInNewTab, false);
  assert.equal(data["filmBridge.credentials.v1"].omdbApiKey, "test-key-never-saved-by-a-display-toggle");
  await options.locator("#show-letterboxd-rating").check();
  await page.waitForFunction(() => document.querySelector("#film-bridge-extension-root")?.shadowRoot.querySelectorAll('.rating:not([hidden])').length === 1);
  assert.deepEqual((await snapshot(page)).cards, ["letterboxd"]);
  await options.locator("#show-ratings").uncheck();
  await options.waitForFunction(() => document.getElementById("status").className === "success");
  assert.equal((await snapshot(page)).shown, false);
  for (const key of Shared.RATING_KEYS) {
    assert.equal(await options.locator(`[data-rating-switch="${key}"]`).isChecked(), false);
  }
  assert.equal(await options.locator("#rating-visibility-controls").getAttribute("data-all-off"), "true");
  await options.locator("#show-ratings").check();
  await options.waitForFunction(() => document.getElementById("status").className === "success");
  assert.deepEqual((await snapshot(page)).cards, Shared.RATING_KEYS);
  await options.click("#disable-all-ratings");
  await options.waitForFunction(() => document.getElementById("status").className === "success");
  await options.locator("#show-letterboxd-rating").check();
  await options.waitForFunction(() => document.getElementById("status").className === "success");
  await options.locator("#show-letterboxd-rating").uncheck();
  await options.waitForFunction(() => document.getElementById("status").className === "success");
  assert.equal(await options.locator("#show-ratings").isChecked(), false);
  await options.locator("#show-ratings").check();
  await options.waitForFunction(() => document.getElementById("status").className === "success");
  assert.ok(Object.values(data[Shared.SETTINGS_KEY].ratingVisibility).every(Boolean));
  await options.click("#disable-all-ratings");
  await options.waitForFunction(() => document.getElementById("status").className === "success");

  // Configure only an unavailable API source: no rendered cards must mean no outer shell either.
  await page.evaluate(() => { window.bridgeApiUnavailable = true; });
  await options.locator("#show-imdb-rating").check();
  await options.waitForFunction(() => document.getElementById("status").className === "success");
  await page.waitForTimeout(200);
  assert.equal((await snapshot(page)).shown, false);
  assert.equal((await snapshot(page)).height, 0);

  // A late response from an older request must not undo the latest close operation.
  await page.evaluate(() => { window.bridgeHoldResponses = true; });
  await options.click("#enable-all-ratings");
  await page.waitForFunction(() => window.bridgePendingResponses.length > 0);
  await options.click("#disable-all-ratings");
  await options.waitForFunction(() => document.getElementById("status").className === "success");
  await page.evaluate(async () => {
    const pending = window.bridgePendingResponses.splice(0);
    for (const deliver of pending) await deliver();
  });
  assert.equal((await snapshot(page)).shown, false);
  await options.evaluate(() => {
    for (let i = 0; i < 8; i += 1) {
      document.getElementById("enable-all-ratings").click();
      document.getElementById("disable-all-ratings").click();
    }
    document.getElementById("show-tmdb-rating").click();
  });
  await options.waitForFunction(() => document.getElementById("status").className === "success");
  assert.deepEqual(data[Shared.SETTINGS_KEY].ratingVisibility, Object.fromEntries(Shared.RATING_KEYS.map((key) => [key, key === "tmdb"])));
  await options.reload();
  await options.waitForFunction(() => !document.getElementById("show-ratings").disabled);
  assert.equal(await options.locator("#show-ratings").isChecked(), true);
  assert.equal(await options.locator("#show-tmdb-rating").isChecked(), true);
  assert.equal(await options.locator("#show-douban-rating").isChecked(), false);
  const otherOptions = await context.newPage();
  otherOptions.on("pageerror", (error) => errors.push(error.message));
  await otherOptions.goto("https://film-bridge.test/options.html");
  await otherOptions.waitForFunction(() => !document.getElementById("show-ratings").disabled);
  await options.locator("#omdb-key").fill("unsaved-input-must-not-change");
  await otherOptions.locator("#show-ratings").uncheck();
  await options.waitForFunction(() => !document.getElementById("show-ratings").checked);
  assert.equal(await options.locator("#omdb-key").inputValue(), "unsaved-input-must-not-change");
  for (const key of Shared.RATING_KEYS) {
    assert.equal(await options.locator(`[data-rating-switch="${key}"]`).isChecked(), false);
  }
  // Actual settings-page handlers must preserve sources while saving/deleting optional keys.
  await options.locator("#omdb-key").fill("mock-omdb-key");
  await options.locator("#tmdb-credential").fill("mock-tmdb-key");
  await options.locator('[type="submit"]').click();
  await options.waitForFunction(() => !document.querySelector('[type="submit"]').disabled && document.getElementById("status").className === "success");
  assert.equal(data[Shared.SETTINGS_KEY].showRatings, false);
  assert.equal(data[Shared.SETTINGS_KEY].cacheHours, 72);
  assert.equal(data["filmBridge.credentials.v1"].tmdbCredential, "mock-tmdb-key");
  assert.equal(await options.locator("#omdb-permission").textContent(), "已授权");
  await options.locator('[data-clear-credential="omdb-key"]').click();
  await options.waitForFunction(() => document.getElementById("status").className === "success");
  assert.equal(data["filmBridge.credentials.v1"].omdbApiKey, undefined);
  assert.equal(data["filmBridge.credentials.v1"].tmdbCredential, "mock-tmdb-key");
  assert.equal(grantedOrigins.has("https://www.omdbapi.com/*"), false);
  await options.locator('[data-clear-credential="tmdb-credential"]').click();
  await options.waitForFunction(() => document.getElementById("status").className === "success");
  assert.equal(data["filmBridge.credentials.v1"], undefined);
  assert.equal(grantedOrigins.size, 0);
  assert.deepEqual(errors, []);
  console.log("Browser regression checks passed: six page layouts, zero empty shells/margins, synchronized master/sources, live multi-tab switches, API absence, stale responses, rapid clicks and reload persistence.");
} finally {
  await browser.close();
}
