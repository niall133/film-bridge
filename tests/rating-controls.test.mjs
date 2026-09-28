import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const Shared = require("../src/shared.js");
const only = (key) => Object.fromEntries(Shared.RATING_KEYS.map((source) => [source, source === key]));

test("all-off closes the master and all-on reopens every source", () => {
  const closed = Shared.changeRatingControls({}, { type: "all", enabled: false });
  assert.equal(closed.showRatings, false);
  assert.equal(Shared.hasEnabledRatings(closed), false);
  assert.ok(Object.values(closed.ratingVisibility).every((enabled) => !enabled));
  const opened = Shared.changeRatingControls(closed, { type: "all", enabled: true });
  assert.equal(opened.showRatings, true);
  assert.ok(Object.values(opened.ratingVisibility).every(Boolean));
});

test("master toggles all five sources without changing other preferences", () => {
  const chosen = { ratingVisibility: only("letterboxd"), cacheHours: 72, openInNewTab: false };
  const closed = Shared.changeRatingControls(chosen, { type: "master", enabled: false });
  assert.equal(Shared.hasEnabledRatings(closed), false);
  assert.deepEqual(closed.ratingVisibility, only(null));
  const opened = Shared.changeRatingControls(closed, { type: "master", enabled: true });
  assert.equal(opened.showRatings, true);
  assert.ok(Object.values(opened.ratingVisibility).every(Boolean));
  assert.equal(opened.cacheHours, 72);
  assert.equal(opened.openInNewTab, false);
});

test("last-source close and first-source open synchronize the master", () => {
  const closed = Shared.changeRatingControls({ ratingVisibility: only("imdb") }, {
    type: "source", key: "imdb", enabled: false
  });
  assert.equal(closed.showRatings, false);
  const opened = Shared.changeRatingControls(closed, { type: "source", key: "tmdb", enabled: true });
  assert.equal(opened.showRatings, true);
  assert.deepEqual(opened.ratingVisibility, only("tmdb"));
});

test("master enable from an empty selection restores all five", () => {
  const opened = Shared.changeRatingControls({ ratingVisibility: only(null) }, { type: "master", enabled: true });
  assert.equal(opened.showRatings, true);
  assert.ok(Object.values(opened.ratingVisibility).every(Boolean));
});

test("legacy preferences migrate without defaults overwriting saved source choices", () => {
  const settings = Shared.normalizeSettings({
    ratingDisplay: { douban: "letterboxd" },
    externalRatingDisplay: { imdb: false, tmdb: false },
    ratingVisibility: { metacritic: false }
  });
  assert.deepEqual(settings.ratingVisibility, only("letterboxd"));
  assert.equal(settings.showRatings, true);
  assert.equal(Shared.normalizeSettings({ showRatings: true, ratingVisibility: only(null) }).showRatings, false);
});

test("old paused settings migrate to all-off and normalization is idempotent", () => {
  const migrated = Shared.normalizeSettings({ showRatings: false, ratingVisibility: only("letterboxd") });
  assert.deepEqual(migrated.ratingVisibility, only(null));
  assert.equal(migrated.showRatings, false);
  assert.deepEqual(Shared.normalizeSettings(migrated), migrated);
});

test("every source combination and transition preserves master equals any source enabled", () => {
  for (let mask = 0; mask < 32; mask += 1) {
    const ratingVisibility = Object.fromEntries(Shared.RATING_KEYS.map((key, index) => [key, Boolean(mask & (1 << index))]));
    for (const type of ["all", "master", "source"]) {
      for (const enabled of [true, false]) {
        for (const key of Shared.RATING_KEYS) {
          const next = Shared.changeRatingControls({ ratingVisibility }, { type, key, enabled });
          assert.equal(next.showRatings, Object.values(next.ratingVisibility).some(Boolean));
          if (type === "source") {
            assert.equal(next.ratingVisibility[key], enabled);
            for (const other of Shared.RATING_KEYS.filter((source) => source !== key)) {
              assert.equal(next.ratingVisibility[other], ratingVisibility[other]);
            }
          } else {
            assert.ok(Object.values(next.ratingVisibility).every((value) => value === enabled));
          }
        }
      }
    }
  }
});

test("background stops resolution and API requests when master or all sources are off", async () => {
  const source = await readFile(new URL("../src/background.js", import.meta.url), "utf8");
  for (const settings of [{ showRatings: false }, { showRatings: true, ratingVisibility: only(null) }]) {
    let writes = 0;
    let requests = 0;
    let listener;
    const context = vm.createContext({
      FilmBridgeShared: Shared,
      URL, console,
      fetch() { requests += 1; throw new Error("unexpected network request"); },
      chrome: {
        runtime: { onMessage: { addListener(value) { listener = value; } } },
        storage: { local: {
          async get() { return {
            [Shared.SETTINGS_KEY]: settings,
            "filmBridge.credentials.v1": { omdbApiKey: "configured-test-key", tmdbCredential: "configured-test-token" }
          }; },
          async set() { writes += 1; }
        } }
      }
    });
    vm.runInContext(source, context);
    const response = await new Promise((resolve) => {
      assert.equal(listener({ type: "FILM_BRIDGE_RESOLVE", payload: {
        source: "douban", title: "Inception", imdbId: "tt1375666", year: 2010,
        pageUrl: "https://movie.douban.com/subject/3541415/"
      } }, { url: "https://movie.douban.com/subject/3541415/" }, resolve), true);
    });
    assert.equal(response.ok, true);
    assert.equal(response.settings.showRatings, false);
    assert.equal(requests, 0);
    assert.equal(writes, 0);
  }
});

test("keeping only the current site's score does not fetch disabled sources", async () => {
  const code = await readFile(new URL("../src/background.js", import.meta.url), "utf8");
  for (const source of Shared.RATING_KEYS) {
    let requests = 0;
    let listener;
    const settings = { ratingVisibility: only(source) };
    const cache = {
      [Shared.SETTINGS_KEY]: settings,
      "filmBridge.credentials.v1": { omdbApiKey: "configured-test-key", tmdbCredential: "configured-test-token" }
    };
    const context = vm.createContext({
      FilmBridgeShared: Shared,
      URL, console,
      fetch() { requests += 1; throw new Error("unexpected network request"); },
      chrome: {
        permissions: { async contains() { return true; } },
        runtime: { onMessage: { addListener(value) { listener = value; } } },
        storage: { local: {
          async get(keys) {
            if (keys == null) return cache;
            return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, cache[key]]));
          },
          async set(items) { Object.assign(cache, items); }
        } }
      }
    });
    vm.runInContext(code, context);
    const pages = {
      douban: "https://movie.douban.com/subject/3541415/",
      letterboxd: "https://letterboxd.com/film/inception/",
      imdb: "https://www.imdb.com/title/tt1375666/",
      tmdb: "https://www.themoviedb.org/movie/27205-inception",
      metacritic: "https://www.metacritic.com/movie/inception/"
    };
    const response = await new Promise((resolve) => listener({ type: "FILM_BRIDGE_RESOLVE", payload: {
      source, title: "Inception", imdbId: "tt1375666", tmdbId: "27205", year: 2010,
      rating: 4, pageUrl: pages[source]
    } }, { url: pages[source] }, resolve));
    assert.equal(response.ok, true);
    assert.equal(response.ratings[source].value, 4);
    assert.equal(requests, 0, source);
  }
});

test("OMDb can supply Metascore without overwriting the live IMDb page rating", async () => {
  const code = await readFile(new URL("../src/background.js", import.meta.url), "utf8");
  const cache = {
    [Shared.SETTINGS_KEY]: { ratingVisibility: { ...only("imdb"), metacritic: true } },
    "filmBridge.credentials.v1": { omdbApiKey: "configured-test-key" }
  };
  let listener;
  let requests = 0;
  const context = vm.createContext({
    FilmBridgeShared: Shared, URL, console, AbortController, setTimeout, clearTimeout,
    async fetch(url) {
      requests += 1;
      assert.equal(new URL(url).hostname, "www.omdbapi.com");
      return { ok: true, async json() { return { imdbRating: "6.5", Metascore: "78", imdbVotes: "1,000" }; } };
    },
    chrome: {
      permissions: { async contains() { return true; } },
      runtime: { onMessage: { addListener(value) { listener = value; } } },
      storage: { local: {
        async get(keys) {
          if (keys == null) return cache;
          return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, cache[key]]));
        },
        async set(items) { Object.assign(cache, items); }
      } }
    }
  });
  vm.runInContext(code, context);
  const response = await new Promise((resolve) => listener({ type: "FILM_BRIDGE_RESOLVE", payload: {
    source: "imdb", title: "Inception", imdbId: "tt1375666", year: 2010,
    rating: 8.8, ratingCount: 2000, pageUrl: "https://www.imdb.com/title/tt1375666/"
  } }, { url: "https://www.imdb.com/title/tt1375666/" }, resolve));
  assert.equal(response.ok, true);
  assert.equal(requests, 1);
  assert.equal(response.ratings.imdb.value, 8.8);
  assert.equal(response.ratings.imdb.count, 2000);
  assert.equal(response.ratings.metacritic.value, 78);
  assert.equal(response.ratings.metacritic.url, "https://www.imdb.com/title/tt1375666/criticreviews/");
});
