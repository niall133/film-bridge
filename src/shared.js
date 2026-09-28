(function initializeFilmBridgeShared(root, factory) {
  const api = factory();
  root.FilmBridgeShared = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createSharedApi() {
  "use strict";

  const SITES = Object.freeze({
    douban: Object.freeze({
      label: "豆瓣",
      ratingLabel: "DOUBAN",
      maxRating: 10
    }),
    letterboxd: Object.freeze({
      label: "Letterboxd",
      ratingLabel: "LETTERBOXD",
      maxRating: 5
    }),
    imdb: Object.freeze({
      label: "IMDb",
      ratingLabel: "IMDB",
      maxRating: 10
    }),
    tmdb: Object.freeze({
      label: "TMDB",
      ratingLabel: "TMDB",
      maxRating: 10
    }),
    metacritic: Object.freeze({
      label: "Metacritic",
      ratingLabel: "METASCORE",
      maxRating: 100
    })
  });

  const SOURCE_HOSTS = Object.freeze({
    douban: Object.freeze(["movie.douban.com"]),
    letterboxd: Object.freeze(["letterboxd.com"]),
    imdb: Object.freeze(["imdb.com", "www.imdb.com"]),
    tmdb: Object.freeze(["themoviedb.org", "www.themoviedb.org"]),
    metacritic: Object.freeze(["metacritic.com", "www.metacritic.com"])
  });

  const SETTINGS_KEY = "filmBridge.settings.v1";
  const RATING_KEYS = Object.freeze(Object.keys(SITES));

  function normalizeSettings(input) {
    const saved = input && typeof input === "object" ? input : {};
    const legacy = saved.ratingDisplay ?? {};
    const external = saved.externalRatingDisplay ?? {};
    const visibility = saved.ratingVisibility ?? {};
    const fallback = {
      douban: legacy.douban !== "letterboxd",
      letterboxd: legacy.letterboxd !== "douban",
      imdb: external.imdb !== false,
      tmdb: external.tmdb !== false,
      metacritic: external.metacritic !== false
    };
    const ratingVisibility = Object.fromEntries(RATING_KEYS.map((key) => [
      key,
      Object.prototype.hasOwnProperty.call(visibility, key) ? visibility[key] !== false : fallback[key]
    ]));
    // Migrate older paused states: an explicitly disabled master now disables every source.
    if (saved.showRatings === false) {
      for (const key of RATING_KEYS) ratingVisibility[key] = false;
    }
    return {
      openInNewTab: saved.openInNewTab !== false,
      showRatings: Object.values(ratingVisibility).some(Boolean),
      cacheHours: [6, 24, 72].includes(Number(saved.cacheHours)) ? Number(saved.cacheHours) : 24,
      ratingVisibility,
      externalRatingDisplay: Object.fromEntries(
        ["imdb", "tmdb", "metacritic"].map((key) => [key, ratingVisibility[key]])
      )
    };
  }

  function hasEnabledRatings(settings) {
    const normalized = normalizeSettings(settings);
    return normalized.showRatings && Object.values(normalized.ratingVisibility).some(Boolean);
  }

  // The master is always the OR of the sources; toggling it is equivalent to all-on/all-off.
  function changeRatingControls(settings, action) {
    const next = normalizeSettings(settings);
    if (action.type === "all" || action.type === "master") {
      next.ratingVisibility = Object.fromEntries(RATING_KEYS.map((key) => [key, Boolean(action.enabled)]));
      next.showRatings = Boolean(action.enabled);
    } else if (action.type === "source" && RATING_KEYS.includes(action.key)) {
      next.ratingVisibility[action.key] = Boolean(action.enabled);
      next.showRatings = Object.values(next.ratingVisibility).some(Boolean);
    }
    return normalizeSettings(next);
  }

  function normalizeWhitespace(value) {
    return String(value ?? "")
      .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseYear(value) {
    const match = String(value ?? "").match(/(?:^|\D)((?:18|19|20|21)\d{2})(?:\D|$)/);
    return match ? Number(match[1]) : null;
  }

  function cleanTitle(value) {
    return normalizeWhitespace(value)
      .replace(/\s*[·•]\s*(?:Letterboxd|豆瓣电影)\s*$/i, "")
      .replace(/\s*[-–—]\s*(?:Letterboxd|豆瓣电影|IMDb|TMDB|Metacritic)\s*$/i, "")
      .replace(/\s*[（(](?:18|19|20|21)\d{2}[）)]\s*$/, "")
      .trim();
  }

  function normalizeTitle(value) {
    return cleanTitle(value)
      .normalize("NFKD")
      .replace(/\p{Mark}/gu, "")
      .toLocaleLowerCase("en")
      .replace(/[^\p{Letter}\p{Number}]+/gu, "")
      .trim();
  }

  function uniqueStrings(values, maxLength = 160) {
    const seen = new Set();
    const result = [];

    for (const value of values ?? []) {
      const cleaned = normalizeWhitespace(value).slice(0, maxLength);
      const key = normalizeTitle(cleaned);
      if (!cleaned || !key || seen.has(key)) continue;
      seen.add(key);
      result.push(cleaned);
    }

    return result;
  }

  function titleSimilarity(left, right) {
    const a = normalizeTitle(left);
    const b = normalizeTitle(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) {
      return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.92;
    }

    const grams = (value) => {
      if (value.length < 2) return new Set([value]);
      const output = new Set();
      for (let index = 0; index < value.length - 1; index += 1) {
        output.add(value.slice(index, index + 2));
      }
      return output;
    };

    const aGrams = grams(a);
    const bGrams = grams(b);
    let overlap = 0;
    for (const gram of aGrams) {
      if (bGrams.has(gram)) overlap += 1;
    }
    return (2 * overlap) / (aGrams.size + bGrams.size);
  }

  function normalizeImdbId(value) {
    const match = String(value ?? "").match(/tt\d{5,12}/i);
    return match ? match[0].toLowerCase() : null;
  }

  function normalizeTmdbId(value) {
    const match = String(value ?? "").match(/^\s*(\d{1,12})\s*$/);
    return match ? match[1] : null;
  }

  function finiteRating(value, min, max) {
    if (value == null || normalizeWhitespace(value) === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
    return parsed;
  }

  function sourceUrlMatches(source, value) {
    try {
      const parsed = new URL(String(value ?? ""));
      return parsed.protocol === "https:" && (SOURCE_HOSTS[source] ?? []).includes(parsed.hostname);
    } catch {
      return false;
    }
  }

  function sanitizeFilmPayload(input) {
    if (!input || !Object.prototype.hasOwnProperty.call(SITES, input.source)) {
      return null;
    }

    const source = input.source;
    const title = cleanTitle(input.title).slice(0, 180);
    if (!title) return null;

    let pageUrl = null;
    if (sourceUrlMatches(source, input.pageUrl)) pageUrl = new URL(String(input.pageUrl)).href;

    const rawRatingCount = input.ratingCount;
    const parsedRatingCount = rawRatingCount == null || normalizeWhitespace(rawRatingCount) === ""
      ? null
      : Number(rawRatingCount);

    const maxRating = SITES[source].maxRating;
    return {
      source,
      title,
      alternateTitles: uniqueStrings(input.alternateTitles).slice(0, 8),
      year: parseYear(input.year),
      imdbId: normalizeImdbId(input.imdbId),
      tmdbId: normalizeTmdbId(input.tmdbId),
      tmdbType: input.tmdbType === "tv" ? "tv" : "movie",
      localId: normalizeWhitespace(input.localId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || null,
      rating: finiteRating(input.rating, 0.1, maxRating),
      ratingCount: Number.isFinite(parsedRatingCount) && parsedRatingCount >= 0
        ? Math.round(parsedRatingCount)
        : null,
      pageUrl
    };
  }

  function buildFallbackUrl(targetSite, film) {
    const imdbId = normalizeImdbId(film?.imdbId);
    const tmdbId = normalizeTmdbId(film?.tmdbId);

    if (targetSite === "letterboxd") {
      if (imdbId) return `https://letterboxd.com/imdb/${imdbId}/`;
      if (tmdbId) return `https://letterboxd.com/tmdb/${tmdbId}/`;
      const query = normalizeWhitespace(`${film?.title ?? ""} ${film?.year ?? ""}`);
      return `https://letterboxd.com/search/films/${encodeURIComponent(query)}/`;
    }

    const query = normalizeWhitespace(`${film?.title ?? ""} ${film?.year ?? ""}`);
    return `https://search.douban.com/movie/subject_search?search_text=${encodeURIComponent(query)}&cat=1002`;
  }

  function formatRating(value, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    if (max === 100) return String(Math.round(parsed));
    return parsed.toFixed(1);
  }

  return Object.freeze({
    SITES,
    SOURCE_HOSTS,
    SETTINGS_KEY,
    RATING_KEYS,
    normalizeSettings,
    hasEnabledRatings,
    changeRatingControls,
    normalizeWhitespace,
    parseYear,
    cleanTitle,
    normalizeTitle,
    uniqueStrings,
    titleSimilarity,
    normalizeImdbId,
    normalizeTmdbId,
    finiteRating,
    sourceUrlMatches,
    sanitizeFilmPayload,
    buildFallbackUrl,
    formatRating
  });
});
