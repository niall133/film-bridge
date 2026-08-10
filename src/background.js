"use strict";

if (typeof importScripts === "function" && !globalThis.FilmBridgeShared) {
  importScripts("shared.js");
}

const FilmBridgeShared = globalThis.FilmBridgeShared
  || (typeof require === "function" ? require("./shared.js") : null);

const SETTINGS_KEY = "filmBridge.settings.v1";
const CREDENTIALS_KEY = "filmBridge.credentials.v1";
const CACHE_PREFIX = "filmBridge.cache.v1.";
const OBSERVED_PREFIX = "filmBridge.observed.v1.";
const DEFAULT_SETTINGS = Object.freeze({
  openInNewTab: true,
  showRatings: true,
  cacheHours: 24,
  ratingDisplay: Object.freeze({
    douban: "both",
    letterboxd: "both"
  })
});
const RATING_DISPLAY_MODES = new Set(["both", "douban", "letterboxd"]);

function decodeHtmlEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"'
  };
  return String(value ?? "").replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (full, entity) => {
    if (entity[0] === "#") {
      const radix = entity[1]?.toLowerCase() === "x" ? 16 : 10;
      const digits = radix === 16 ? entity.slice(2) : entity.slice(1);
      const codePoint = Number.parseInt(digits, radix);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : full;
    }
    return named[entity.toLowerCase()] ?? full;
  });
}

function stripTags(value) {
  return FilmBridgeShared.normalizeWhitespace(
    decodeHtmlEntities(String(value ?? "").replace(/<[^>]*>/g, " "))
  );
}

function parseTagAttributes(tag) {
  const attributes = {};
  const expression = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = expression.exec(tag))) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function findMetaContent(html, attributeName, expectedValue) {
  const tags = String(html ?? "").match(/<meta\b[^>]*>/gi) ?? [];
  const expected = String(expectedValue).toLowerCase();
  for (const tag of tags) {
    const attributes = parseTagAttributes(tag);
    if (String(attributes[attributeName] ?? "").toLowerCase() === expected && attributes.content) {
      return attributes.content;
    }
  }
  return null;
}

function flattenJsonLd(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  output.push(value);
  if (Array.isArray(value["@graph"])) flattenJsonLd(value["@graph"], output);
  return output;
}

function parseJsonLdMovies(html) {
  const movies = [];
  const expression = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = expression.exec(String(html ?? "")))) {
    const raw = match[1]
      .replace(/^\s*\/\*\s*<!\[CDATA\[\s*\*\/\s*/, "")
      .replace(/\s*\/\*\s*\]\]>\s*\*\/\s*$/, "")
      .trim();
    if (!raw) continue;
    try {
      for (const item of flattenJsonLd(JSON.parse(raw))) {
        const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
        if (types.some((type) => String(type).toLowerCase() === "movie")) movies.push(item);
      }
    } catch {
      // Ignore unrelated malformed JSON-LD blocks.
    }
  }
  return movies;
}

function parseLetterboxdHtml(html, finalUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(finalUrl);
  } catch {
    return null;
  }

  const jsonLd = parseJsonLdMovies(html)[0] ?? null;
  const isFilm = parsedUrl.hostname === "letterboxd.com"
    && parsedUrl.pathname.startsWith("/film/")
    && Boolean(jsonLd);
  if (!isFilm) return null;

  const aggregate = jsonLd.aggregateRating;
  const ratingCountText = String(aggregate?.ratingCount ?? "").replace(/[^\d]/g, "");
  const ratingCount = ratingCountText ? Number(ratingCountText) : null;
  const rating = (ratingCount ?? 0) > 0
    ? FilmBridgeShared.finiteRating(aggregate?.ratingValue, 0.1, 5)
    : null;
  const imdbId = FilmBridgeShared.normalizeImdbId(
    String(html).match(/imdb\.com\/title\/(tt\d{5,12})/i)?.[1]
  );
  const tmdbId = FilmBridgeShared.normalizeTmdbId(
    String(html).match(/<body\b[^>]*\bdata-tmdb-id=["'](\d+)["']/i)?.[1]
  );
  const tmdbType = String(html).match(/<body\b[^>]*\bdata-tmdb-type=["'](movie|tv)["']/i)?.[1] === "tv"
    ? "tv"
    : "movie";

  let canonicalUrl = parsedUrl.href;
  try {
    const candidateUrl = new URL(jsonLd.url || jsonLd["@id"] || parsedUrl.href, parsedUrl);
    if (candidateUrl.hostname === "letterboxd.com" && candidateUrl.pathname.startsWith("/film/")) {
      canonicalUrl = candidateUrl.href;
    }
  } catch {
    canonicalUrl = parsedUrl.href;
  }

  return {
    url: canonicalUrl,
    title: FilmBridgeShared.cleanTitle(jsonLd.name || findMetaContent(html, "property", "og:title")),
    year: FilmBridgeShared.parseYear(jsonLd.dateCreated)
      || FilmBridgeShared.parseYear(findMetaContent(html, "property", "og:title")),
    imdbId,
    tmdbId,
    tmdbType,
    rating,
    ratingCount
  };
}

function parseDoubanHtml(html, finalUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(finalUrl);
  } catch {
    return null;
  }
  const subjectId = parsedUrl.pathname.match(/\/subject\/(\d+)/)?.[1];
  if (parsedUrl.hostname !== "movie.douban.com" || !subjectId) return null;

  const jsonLd = parseJsonLdMovies(html)[0] ?? null;
  const titleBlock = String(html).match(
    /<span\b[^>]*property=["']v:itemreviewed["'][^>]*>([\s\S]*?)<\/span>/i
  )?.[1];
  const yearBlock = String(html).match(/<span\b[^>]*class=["'][^"']*\byear\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const ratingBlock = String(html).match(
    /<(?:strong|span)\b[^>]*property=["']v:average["'][^>]*>([\s\S]*?)<\/(?:strong|span)>/i
  )?.[1];
  const votesBlock = String(html).match(
    /<span\b[^>]*property=["']v:votes["'][^>]*>([\s\S]*?)<\/span>/i
  )?.[1];
  const domRating = FilmBridgeShared.finiteRating(stripTags(ratingBlock), 0.1, 10);
  const domCount = Number(stripTags(votesBlock).replace(/[^\d]/g, "")) || null;
  const ldCount = Number(String(jsonLd?.aggregateRating?.ratingCount ?? "").replace(/[^\d]/g, "")) || null;
  const ldRating = ldCount
    ? FilmBridgeShared.finiteRating(jsonLd?.aggregateRating?.ratingValue, 0.1, 10)
    : null;

  const title = FilmBridgeShared.cleanTitle(
    stripTags(titleBlock) || jsonLd?.name || findMetaContent(html, "property", "og:title")
  );
  if (!title || (!titleBlock && !jsonLd)) return null;

  return {
    url: `https://movie.douban.com/subject/${subjectId}/`,
    localId: subjectId,
    title,
    year: FilmBridgeShared.parseYear(stripTags(yearBlock))
      || FilmBridgeShared.parseYear(jsonLd?.datePublished),
    imdbId: FilmBridgeShared.normalizeImdbId(
      stripTags(html).match(/\bIMDb\s*:\s*(tt\d{5,12})\b/i)?.[1]
    ),
    rating: domRating ?? ldRating,
    ratingCount: domCount ?? ldCount
  };
}

function cleanDoubanCandidate(candidate) {
  if (!candidate || candidate.type !== "movie" || !/^\d+$/.test(String(candidate.id ?? ""))) return null;
  const id = String(candidate.id);
  if (candidate.url && !new RegExp(`/subject/${id}(?:/|\\?|$)`).test(candidate.url)) return null;
  return {
    id,
    title: FilmBridgeShared.cleanTitle(candidate.title),
    subTitle: FilmBridgeShared.cleanTitle(candidate.sub_title),
    year: FilmBridgeShared.parseYear(candidate.year),
    url: `https://movie.douban.com/subject/${id}/`
  };
}

function scoreDoubanCandidate(candidate, film) {
  const cleaned = cleanDoubanCandidate(candidate);
  if (!cleaned) return null;

  const sourceTitles = FilmBridgeShared.uniqueStrings([film.title, ...(film.alternateTitles ?? [])]);
  const candidateTitles = FilmBridgeShared.uniqueStrings([cleaned.title, cleaned.subTitle]);
  let bestSimilarity = 0;
  let exactTitle = false;
  for (const sourceTitle of sourceTitles) {
    for (const candidateTitle of candidateTitles) {
      const similarity = FilmBridgeShared.titleSimilarity(sourceTitle, candidateTitle);
      bestSimilarity = Math.max(bestSimilarity, similarity);
      if (FilmBridgeShared.normalizeTitle(sourceTitle) === FilmBridgeShared.normalizeTitle(candidateTitle)) {
        exactTitle = true;
      }
    }
  }

  let score = bestSimilarity * 10;
  if (exactTitle) score += 5;
  if (film.year && cleaned.year) {
    const difference = Math.abs(Number(film.year) - Number(cleaned.year));
    if (difference === 0) score += 4;
    else if (difference === 1) score -= 1.5;
    else score -= Math.min(7, difference * 2);
  }

  return { ...cleaned, score, bestSimilarity, exactTitle };
}

function chooseDoubanCandidate(candidates, film) {
  const ranked = (candidates ?? [])
    .map((candidate) => scoreDoubanCandidate(candidate, film))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const second = ranked[1];
  if (!best) return null;

  const yearMatches = Boolean(film.year && best.year && Number(film.year) === Number(best.year));
  const scoreGap = second ? best.score - second.score : 999;
  const clearlyAhead = scoreGap >= 3;
  const confident = yearMatches
    && best.exactTitle
    && best.bestSimilarity >= 0.72
    && best.score >= 10
    && clearlyAhead;

  return confident ? { ...best, scoreGap } : null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options = {}, timeoutMs = 8000) {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return { text: await response.text(), url: response.url, status: response.status };
}

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.json();
}

function cacheIdentity(film) {
  return film.imdbId || (film.tmdbId ? `${film.tmdbType || "movie"}:${film.tmdbId}` : null) || film.localId
    || `${FilmBridgeShared.normalizeTitle(film.title)}:${film.year || "unknown"}`;
}

function storageSafePart(value) {
  return encodeURIComponent(String(value ?? "")).slice(0, 320);
}

async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

async function setStorage(items) {
  return chrome.storage.local.set(items);
}

async function readSettings() {
  const stored = await getStorage([SETTINGS_KEY, CREDENTIALS_KEY]);
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(stored[SETTINGS_KEY] ?? {})
  };
  const cacheHours = Number(settings.cacheHours);
  settings.cacheHours = [6, 24, 72].includes(cacheHours) ? cacheHours : DEFAULT_SETTINGS.cacheHours;
  settings.openInNewTab = settings.openInNewTab !== false;
  settings.showRatings = settings.showRatings !== false;
  const ratingDisplay = settings.ratingDisplay && typeof settings.ratingDisplay === "object"
    ? settings.ratingDisplay
    : {};
  settings.ratingDisplay = {
    douban: RATING_DISPLAY_MODES.has(ratingDisplay.douban)
      ? ratingDisplay.douban
      : DEFAULT_SETTINGS.ratingDisplay.douban,
    letterboxd: RATING_DISPLAY_MODES.has(ratingDisplay.letterboxd)
      ? ratingDisplay.letterboxd
      : DEFAULT_SETTINGS.ratingDisplay.letterboxd
  };
  return {
    settings,
    credentials: {
      omdbApiKey: String(stored[CREDENTIALS_KEY]?.omdbApiKey ?? "").trim(),
      tmdbCredential: String(stored[CREDENTIALS_KEY]?.tmdbCredential ?? "").trim()
    }
  };
}

async function readCache(namespace, identity, maxAgeMs) {
  const key = `${CACHE_PREFIX}${namespace}.${storageSafePart(identity)}`;
  const item = (await getStorage(key))[key];
  if (!item || !Number.isFinite(item.savedAt)) return null;
  if (Date.now() - item.savedAt > maxAgeMs) {
    chrome.storage.local.remove(key).catch(() => {});
    return null;
  }
  return item.value ?? null;
}

async function writeCache(namespace, identity, value) {
  const key = `${CACHE_PREFIX}${namespace}.${storageSafePart(identity)}`;
  try {
    await setStorage({ [key]: { savedAt: Date.now(), value } });
  } catch {
    // Storage pressure must never disable the page's immediate jump button.
  }
  return value;
}

async function removeCache(namespace, identity) {
  const key = `${CACHE_PREFIX}${namespace}.${storageSafePart(identity)}`;
  try {
    await chrome.storage.local.remove(key);
  } catch {
    // Cache removal is best-effort.
  }
}

function observationKeys(source, film) {
  const identities = [];
  if (film.imdbId) identities.push(`imdb.${film.imdbId}`);
  if (film.tmdbId) identities.push(`tmdb.${film.tmdbType || "movie"}.${film.tmdbId}`);
  if (film.localId) identities.push(`local.${film.localId}`);
  for (const title of FilmBridgeShared.uniqueStrings([film.title, ...(film.alternateTitles ?? [])]).slice(0, 4)) {
    identities.push(`title.${FilmBridgeShared.normalizeTitle(title)}.${film.year || "unknown"}`);
  }
  return identities.map((identity) => `${OBSERVED_PREFIX}${source}.${storageSafePart(identity)}`);
}

async function saveObservation(film) {
  const keys = observationKeys(film.source, film);
  if (!keys.length) return;
  const record = {
    source: film.source,
    url: film.pageUrl,
    localId: film.localId,
    title: film.title,
    alternateTitles: film.alternateTitles,
    year: film.year,
    imdbId: film.imdbId,
    tmdbId: film.tmdbId,
    tmdbType: film.tmdbType,
    rating: film.rating,
    ratingCount: film.ratingCount,
    observedAt: Date.now()
  };
  const items = {};
  for (const key of keys) items[key] = record;
  await setStorage(items);
}

async function findObservation(targetSource, film, maxAgeMs) {
  const keys = observationKeys(targetSource, { ...film, localId: null });
  if (!keys.length) return null;
  const stored = await getStorage(keys);
  for (const key of keys) {
    const record = stored[key];
    if (!record) continue;
    if (Date.now() - Number(record.observedAt) > maxAgeMs) {
      chrome.storage.local.remove(key).catch(() => {});
      continue;
    }
    if (film.imdbId && record.imdbId !== film.imdbId) continue;
    if (film.tmdbId && record.tmdbId && record.tmdbId !== film.tmdbId) continue;
    if (film.tmdbId && record.tmdbId && (record.tmdbType || "movie") !== (film.tmdbType || "movie")) continue;
    if (film.year && record.year && Number(film.year) !== Number(record.year)) continue;
    return record;
  }
  return null;
}

async function enforceStorageBudget() {
  if (!chrome.storage.local.getBytesInUse) return;
  const bytesInUse = await chrome.storage.local.getBytesInUse(null);
  if (bytesInUse < 4 * 1024 * 1024) return;

  const stored = await getStorage(null);
  const candidates = Object.entries(stored)
    .filter(([key]) => key.startsWith(CACHE_PREFIX) || key.startsWith(OBSERVED_PREFIX))
    .map(([key, value]) => ({
      key,
      timestamp: Number(value?.savedAt ?? value?.observedAt ?? 0)
    }))
    .sort((left, right) => left.timestamp - right.timestamp);
  const removeCount = Math.max(200, Math.ceil(candidates.length * 0.35));
  const keys = candidates.slice(0, removeCount).map((item) => item.key);
  if (keys.length) await chrome.storage.local.remove(keys);
}

function ratingFromRecord(record, max) {
  return record?.rating == null ? null : {
    value: record.rating,
    max,
    count: record.ratingCount ?? null,
    url: record.url ?? null
  };
}

async function resolveLetterboxdTarget(film, settings) {
  const maxAge = settings.cacheHours * 60 * 60 * 1000;
  const observed = await findObservation("letterboxd", film, maxAge);
  if (observed?.url) {
    return {
      target: { url: observed.url, direct: true, matchedBy: "observed_cache", verified: true },
      remote: observed,
      rating: ratingFromRecord(observed, 5)
    };
  }

  const cached = await readCache("target.letterboxd", cacheIdentity(film), maxAge);
  if (cached) return cached;

  const routeId = film.imdbId || film.tmdbId;
  const matchedBy = film.imdbId ? "imdb" : film.tmdbId ? "tmdb" : null;
  if (!routeId) {
    return {
      target: {
        url: FilmBridgeShared.buildFallbackUrl("letterboxd", film),
        direct: false,
        matchedBy: null,
        verified: false
      },
      remote: null,
      rating: null
    };
  }

  const routeUrl = film.imdbId
    ? `https://letterboxd.com/imdb/${film.imdbId}/`
    : `https://letterboxd.com/tmdb/${film.tmdbId}/`;

  if (!settings.showRatings) {
    return {
      target: { url: routeUrl, direct: true, matchedBy, verified: false },
      remote: null,
      rating: null
    };
  }

  try {
    const response = await fetchText(routeUrl, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "text/html,application/xhtml+xml" }
    });
    const parsed = parseLetterboxdHtml(response.text, response.url);
    if (!parsed) {
      return {
        target: {
          url: FilmBridgeShared.buildFallbackUrl("letterboxd", { ...film, imdbId: null, tmdbId: null }),
          direct: false,
          matchedBy: null,
          verified: false
        },
        remote: null,
        rating: null
      };
    }
    const value = {
      target: { url: parsed.url, direct: true, matchedBy, verified: true },
      remote: parsed,
      rating: ratingFromRecord(parsed, 5)
    };
    await writeCache("target.letterboxd", cacheIdentity(film), value);
    return value;
  } catch {
    return {
      target: { url: routeUrl, direct: true, matchedBy, verified: false },
      remote: null,
      rating: null
    };
  }
}

async function fetchDoubanSuggestions(query) {
  if (!FilmBridgeShared.normalizeTitle(query)) return [];
  const url = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(query)}`;
  const data = await fetchJson(url, {
    cache: "no-store",
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  return Array.isArray(data) ? data : [];
}

async function fetchDoubanDetail(url) {
  const response = await fetchText(url, {
    cache: "no-store",
    credentials: "include",
    headers: { Accept: "text/html,application/xhtml+xml" }
  });
  return parseDoubanHtml(response.text, response.url);
}

async function resolveDoubanTarget(film, settings) {
  const maxAge = settings.cacheHours * 60 * 60 * 1000;
  const observed = await findObservation("douban", film, maxAge);
  if (observed?.localId || observed?.url) {
    const url = observed.localId
      ? `https://movie.douban.com/subject/${observed.localId}/`
      : observed.url;
    return {
      target: { url, direct: true, matchedBy: "observed_cache", verified: true },
      remote: observed,
      rating: ratingFromRecord(observed, 10)
    };
  }

  const cached = await readCache("target.douban", cacheIdentity(film), maxAge);
  if (cached) {
    const needsIdentityVerification = Boolean(film.imdbId && cached.target?.verified !== true);
    const shouldRetryEnrichment = !cached.ratingAttemptedAt
      || Date.now() - cached.ratingAttemptedAt > Math.min(maxAge, 60 * 60 * 1000);
    if (
      cached.target?.direct
      && shouldRetryEnrichment
      && (needsIdentityVerification || (settings.showRatings && !cached.rating))
    ) {
      try {
        const detail = await fetchDoubanDetail(cached.target.url);
        const imdbConflict = film.imdbId && detail?.imdbId && film.imdbId !== detail.imdbId;
        const yearConflict = film.year && detail?.year && Number(film.year) !== Number(detail.year);
        if (imdbConflict || yearConflict) {
          await removeCache("target.douban", cacheIdentity(film));
          return {
            target: {
              url: FilmBridgeShared.buildFallbackUrl("douban", film),
              direct: false,
              matchedBy: null,
              verified: false
            },
            remote: null,
            rating: null
          };
        }
        if (detail) {
          cached.remote = detail;
          cached.rating = ratingFromRecord(detail, 10);
          cached.target.verified = !film.imdbId || detail.imdbId === film.imdbId;
          if (film.imdbId && detail.imdbId === film.imdbId) cached.target.matchedBy = "imdb";
        }
        cached.ratingAttemptedAt = Date.now();
        await writeCache("target.douban", cacheIdentity(film), cached);
      } catch {
        cached.ratingAttemptedAt = Date.now();
        await writeCache("target.douban", cacheIdentity(film), cached);
      }
    }
    return cached;
  }

  const queries = FilmBridgeShared.uniqueStrings([film.title, ...(film.alternateTitles ?? [])]).slice(0, 2);
  let selected = null;
  for (const query of queries) {
    try {
      const candidates = await fetchDoubanSuggestions(query);
      selected = chooseDoubanCandidate(candidates, film);
      if (selected) break;
    } catch {
      // Try one alternate title before falling back to the search page.
    }
  }

  if (!selected) {
    return {
      target: {
        url: FilmBridgeShared.buildFallbackUrl("douban", film),
        direct: false,
        matchedBy: null,
        verified: false
      },
      remote: null,
      rating: null
    };
  }

  let detail = null;
  if (settings.showRatings || film.imdbId) {
    try {
      detail = await fetchDoubanDetail(selected.url);
    } catch {
      detail = null;
    }
  }

  const imdbConflict = film.imdbId && detail?.imdbId && film.imdbId !== detail.imdbId;
  const yearConflict = film.year && detail?.year && Number(film.year) !== Number(detail.year);
  if (imdbConflict || yearConflict) {
    return {
      target: {
        url: FilmBridgeShared.buildFallbackUrl("douban", film),
        direct: false,
        matchedBy: null,
        verified: false
      },
      remote: null,
      rating: null
    };
  }

  const imdbVerified = Boolean(film.imdbId && detail?.imdbId === film.imdbId);

  const value = {
    target: {
      url: selected.url,
      direct: true,
      matchedBy: imdbVerified ? "imdb" : "title_year",
      verified: imdbVerified || !film.imdbId
    },
    remote: detail || selected,
    rating: ratingFromRecord(detail, 10),
    ratingAttemptedAt: settings.showRatings || film.imdbId ? Date.now() : null
  };
  await writeCache("target.douban", cacheIdentity(film), value);
  return value;
}

async function hasOptionalOrigin(origin) {
  if (!chrome.permissions?.contains) return false;
  return chrome.permissions.contains({ origins: [origin] });
}

async function fetchOmdbRatings(imdbId, apiKey, cacheHours) {
  if (!imdbId || !apiKey || !(await hasOptionalOrigin("https://www.omdbapi.com/*"))) return {};
  const maxAge = cacheHours * 60 * 60 * 1000;
  const cached = await readCache("rating.omdb", imdbId, maxAge);
  if (cached) return cached;

  try {
    const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(imdbId)}&plot=short&r=json`;
    const data = await fetchJson(url, { cache: "no-store", credentials: "omit" });
    if (data?.Response === "False") return {};
    const imdb = FilmBridgeShared.finiteRating(data?.imdbRating, 0.1, 10);
    const metascore = FilmBridgeShared.finiteRating(data?.Metascore, 0, 100);
    const value = {
      ...(imdb == null ? {} : {
        imdb: {
          value: imdb,
          max: 10,
          count: Number(String(data?.imdbVotes ?? "").replace(/[^\d]/g, "")) || null,
          url: `https://www.imdb.com/title/${imdbId}/`
        }
      }),
      ...(metascore == null ? {} : {
        metacritic: { value: metascore, max: 100, count: null, url: null }
      })
    };
    if (Object.keys(value).length) await writeCache("rating.omdb", imdbId, value);
    return value;
  } catch {
    return {};
  }
}

function tmdbRequestOptions(credential) {
  if (/^eyJ[\w.-]+$/.test(credential)) {
    return { query: "", headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" } };
  }
  return {
    query: `api_key=${encodeURIComponent(credential)}`,
    headers: { Accept: "application/json" }
  };
}

async function fetchTmdbRating(tmdbId, imdbId, tmdbType, credential, cacheHours) {
  if ((!tmdbId && !imdbId) || !credential || !(await hasOptionalOrigin("https://api.themoviedb.org/*"))) {
    return {};
  }
  const mediaType = tmdbType === "tv" ? "tv" : "movie";
  const identity = `${mediaType}:${tmdbId || imdbId}`;
  const maxAge = cacheHours * 60 * 60 * 1000;
  const cached = await readCache("rating.tmdb", identity, maxAge);
  if (cached) return cached;

  const request = tmdbRequestOptions(credential);
  const addQuery = (url, query) => query ? `${url}${url.includes("?") ? "&" : "?"}${query}` : url;
  try {
    let movie;
    if (tmdbId) {
      movie = await fetchJson(
        addQuery(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}`, request.query),
        { cache: "no-store", credentials: "omit", headers: request.headers }
      );
    } else {
      const found = await fetchJson(
        addQuery(
          `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id`,
          request.query
        ),
        { cache: "no-store", credentials: "omit", headers: request.headers }
      );
      movie = mediaType === "tv" ? found?.tv_results?.[0] ?? null : found?.movie_results?.[0] ?? null;
    }
    const voteCount = Number.isFinite(Number(movie?.vote_count)) ? Number(movie.vote_count) : null;
    const rating = voteCount > 0
      ? FilmBridgeShared.finiteRating(movie?.vote_average, 0.1, 10)
      : null;
    if (rating == null) return {};
    const value = {
      tmdb: {
        value: rating,
        max: 10,
        count: voteCount,
        url: movie?.id ? `https://www.themoviedb.org/${mediaType}/${movie.id}` : null
      }
    };
    await writeCache("rating.tmdb", identity, value);
    return value;
  } catch {
    return {};
  }
}

async function resolveFilm(input) {
  const film = FilmBridgeShared.sanitizeFilmPayload(input);
  if (!film) return { ok: false, error: "INVALID_FILM" };

  const { settings, credentials } = await readSettings();
  try {
    await saveObservation(film);
  } catch {
    // A full or unavailable cache must not block navigation and live parsing.
  }
  try {
    await enforceStorageBudget();
  } catch {
    // Maintenance is best-effort and can recover on a later page.
  }

  const [hasOmdbPermission, hasTmdbPermission] = await Promise.all([
    credentials.omdbApiKey ? hasOptionalOrigin("https://www.omdbapi.com/*") : false,
    credentials.tmdbCredential ? hasOptionalOrigin("https://api.themoviedb.org/*") : false
  ]);

  const resolution = film.source === "douban"
    ? await resolveLetterboxdTarget(film, settings)
    : await resolveDoubanTarget(film, settings);

  const ratings = {
    [film.source]: film.rating == null ? null : {
      value: film.rating,
      max: FilmBridgeShared.SITES[film.source].maxRating,
      count: film.ratingCount,
      url: film.pageUrl
    }
  };
  const targetSite = film.source === "douban" ? "letterboxd" : "douban";
  if (resolution.rating) ratings[targetSite] = resolution.rating;

  const resolvedImdbId = film.imdbId || resolution.remote?.imdbId || null;
  const resolvedTmdbId = film.tmdbId || resolution.remote?.tmdbId || null;
  const resolvedTmdbType = film.tmdbId
    ? film.tmdbType
    : resolution.remote?.tmdbType || film.tmdbType || "movie";

  if (settings.showRatings) {
    const [omdbRatings, tmdbRating] = await Promise.all([
      fetchOmdbRatings(resolvedImdbId, credentials.omdbApiKey, settings.cacheHours),
      fetchTmdbRating(
        resolvedTmdbId,
        resolvedImdbId,
        resolvedTmdbType,
        credentials.tmdbCredential,
        settings.cacheHours
      )
    ]);
    Object.assign(ratings, omdbRatings, tmdbRating);
  }

  return {
    ok: true,
    target: resolution.target,
    ratings,
    configured: {
      imdb: Boolean(credentials.omdbApiKey && hasOmdbPermission),
      metacritic: Boolean(credentials.omdbApiKey && hasOmdbPermission),
      tmdb: Boolean(credentials.tmdbCredential && hasTmdbPermission)
    },
    settings
  };
}

function senderMatchesFilm(sender, source) {
  const rawUrl = sender?.tab?.url || sender?.url;
  try {
    const url = new URL(rawUrl);
    return source === "douban"
      ? url.hostname === "movie.douban.com" && url.pathname.startsWith("/subject/")
      : url.hostname === "letterboxd.com" && url.pathname.startsWith("/film/");
  } catch {
    return false;
  }
}

async function clearCaches() {
  const stored = await getStorage(null);
  const keys = Object.keys(stored).filter((key) => key.startsWith(CACHE_PREFIX) || key.startsWith(OBSERVED_PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
  return keys.length;
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "FILM_BRIDGE_OPEN_OPTIONS") {
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "FILM_BRIDGE_CLEAR_CACHE" && sender?.url?.startsWith(chrome.runtime.getURL(""))) {
      clearCaches()
        .then((count) => sendResponse({ ok: true, count }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }

    if (message?.type !== "FILM_BRIDGE_RESOLVE") return false;
    if (!senderMatchesFilm(sender, message?.payload?.source)) {
      sendResponse({ ok: false, error: "UNTRUSTED_SENDER" });
      return false;
    }

    resolveFilm(message.payload)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: "RESOLUTION_FAILED" }));
    return true;
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    decodeHtmlEntities,
    stripTags,
    parseTagAttributes,
    findMetaContent,
    parseJsonLdMovies,
    parseLetterboxdHtml,
    parseDoubanHtml,
    cleanDoubanCandidate,
    scoreDoubanCandidate,
    chooseDoubanCandidate,
    tmdbRequestOptions,
    observationKeys,
    findObservation
  };
}
