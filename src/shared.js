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
    })
  });

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
      .replace(/\s*[-–—]\s*(?:Letterboxd|豆瓣电影)\s*$/i, "")
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

  function sanitizeFilmPayload(input) {
    if (!input || !Object.prototype.hasOwnProperty.call(SITES, input.source)) {
      return null;
    }

    const source = input.source;
    const title = cleanTitle(input.title).slice(0, 180);
    if (!title) return null;

    const expectedHost = source === "douban" ? "movie.douban.com" : "letterboxd.com";
    let pageUrl = null;
    try {
      const parsed = new URL(String(input.pageUrl ?? ""));
      if (parsed.protocol === "https:" && parsed.hostname === expectedHost) {
        pageUrl = parsed.href;
      }
    } catch {
      pageUrl = null;
    }

    const rawRatingCount = input.ratingCount;
    const parsedRatingCount = rawRatingCount == null || normalizeWhitespace(rawRatingCount) === ""
      ? null
      : Number(rawRatingCount);

    return {
      source,
      title,
      alternateTitles: uniqueStrings(input.alternateTitles).slice(0, 8),
      year: parseYear(input.year),
      imdbId: normalizeImdbId(input.imdbId),
      tmdbId: normalizeTmdbId(input.tmdbId),
      tmdbType: input.tmdbType === "tv" ? "tv" : "movie",
      localId: normalizeWhitespace(input.localId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || null,
      rating: source === "douban"
        ? finiteRating(input.rating, 0.1, 10)
        : finiteRating(input.rating, 0.1, 5),
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
    normalizeWhitespace,
    parseYear,
    cleanTitle,
    normalizeTitle,
    uniqueStrings,
    titleSimilarity,
    normalizeImdbId,
    normalizeTmdbId,
    finiteRating,
    sanitizeFilmPayload,
    buildFallbackUrl,
    formatRating
  });
});
