import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Shared = require("../src/shared.js");
const {
  parseLetterboxdHtml,
  parseDoubanHtml,
  chooseDoubanCandidate,
  cleanDoubanCandidate,
  tmdbRequestOptions,
  buildImdbCriticReviewsUrl,
  buildMetacriticUrl,
  observationKeys,
  findObservation
} = require("../src/background.js");

test("shared utilities sanitize IDs and build an immediate Letterboxd route", () => {
  const film = Shared.sanitizeFilmPayload({
    source: "douban",
    title: "盗梦空间 (2010)",
    year: "(2010)",
    imdbId: "https://www.imdb.com/title/TT1375666/",
    localId: "3541415",
    rating: "9.4",
    pageUrl: "https://movie.douban.com/subject/3541415/"
  });

  assert.equal(film.title, "盗梦空间");
  assert.equal(film.year, 2010);
  assert.equal(film.imdbId, "tt1375666");
  assert.equal(film.rating, 9.4);
  assert.equal(
    Shared.buildFallbackUrl("letterboxd", film),
    "https://letterboxd.com/imdb/tt1375666/"
  );
});

test("shared utilities preserve a missing rating count as null", () => {
  const film = Shared.sanitizeFilmPayload({
    source: "letterboxd",
    title: "Future Film",
    year: 2027,
    rating: null,
    ratingCount: null,
    pageUrl: "https://letterboxd.com/film/future-film/"
  });
  assert.equal(film.rating, null);
  assert.equal(film.ratingCount, null);
});

test("shared payload accepts IMDb and TMDB detail pages with source-specific rating scales", () => {
  const imdb = Shared.sanitizeFilmPayload({
    source: "imdb",
    title: "Inception",
    year: 2010,
    imdbId: "tt1375666",
    rating: 8.8,
    pageUrl: "https://www.imdb.com/title/tt1375666/"
  });
  const tmdb = Shared.sanitizeFilmPayload({
    source: "tmdb",
    title: "Inception",
    year: 2010,
    tmdbId: "27205",
    rating: 8.3,
    pageUrl: "https://www.themoviedb.org/movie/27205-inception"
  });
  assert.equal(imdb.source, "imdb");
  assert.equal(imdb.rating, 8.8);
  assert.equal(tmdb.source, "tmdb");
  assert.equal(tmdb.tmdbId, "27205");
  assert.equal(tmdb.rating, 8.3);
  assert.equal(Shared.sanitizeFilmPayload({
    source: "tmdb",
    title: "Inception",
    pageUrl: "https://example.com/movie/27205-inception"
  }).pageUrl, null);
});

test("shared payload accepts a Metacritic movie page and 100-point score", () => {
  const film = Shared.sanitizeFilmPayload({
    source: "metacritic",
    title: "Leviticus",
    year: 2026,
    imdbId: "tt22084616",
    localId: "leviticus",
    rating: 83,
    ratingCount: 27,
    pageUrl: "https://www.metacritic.com/movie/leviticus/"
  });
  assert.equal(film.source, "metacritic");
  assert.equal(film.rating, 83);
  assert.equal(film.ratingCount, 27);
  assert.equal(film.pageUrl, "https://www.metacritic.com/movie/leviticus/");
});

test("Metascore builds a best-effort official Metacritic movie route", () => {
  assert.equal(
    buildMetacriticUrl("The Fence", 2025),
    "https://www.metacritic.com/movie/the-fence-2025/"
  );
  assert.equal(
    buildMetacriticUrl("利未记 Leviticus", 2026, "tt22084616"),
    "https://www.imdb.com/title/tt22084616/criticreviews/"
  );
  assert.equal(
    buildImdbCriticReviewsUrl("tt22084616"),
    "https://www.imdb.com/title/tt22084616/criticreviews/"
  );
  assert.equal(
    buildMetacriticUrl("利未记 Leviticus", 2026, "tt33764258"),
    "https://www.imdb.com/title/tt33764258/criticreviews/"
  );
});

test("Letterboxd parser reads CDATA-wrapped Movie JSON-LD and external IDs", () => {
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta property="og:title" content="Dune: Part Two (2024)">
        <script type="application/ld+json">
        /* <![CDATA[ */
        {
          "@context": "https://schema.org",
          "@type": "Movie",
          "name": "Dune: Part Two",
          "url": "https://letterboxd.com/film/dune-part-two/",
          "dateCreated": "2024-02-06",
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": 4.38,
            "ratingCount": 812345
          }
        }
        /* ]]> */
        </script>
      </head>
      <body data-type="film" data-tmdb-id="693134">
        <a data-track-action="IMDb" href="http://www.imdb.com/title/tt15239678/maindetails">IMDb</a>
      </body>
    </html>`;

  const parsed = parseLetterboxdHtml(html, "https://letterboxd.com/film/dune-part-two/");
  assert.deepEqual(parsed, {
    url: "https://letterboxd.com/film/dune-part-two/",
    title: "Dune: Part Two",
    year: 2024,
    imdbId: "tt15239678",
    tmdbId: "693134",
    tmdbType: "movie",
    rating: 4.38,
    ratingCount: 812345
  });
});

test("Letterboxd parser rejects an invalid IMDb route that returns HTTP 200", () => {
  const html = `
    <html><head><title>IMDb ID Not found • Letterboxd</title></head>
    <body><p>That IMDb ID was not found.</p></body></html>`;
  assert.equal(
    parseLetterboxdHtml(html, "https://letterboxd.com/imdb/tt99999999/"),
    null
  );
});

test("Letterboxd parser keeps an unreleased movie's missing rating as null", () => {
  const html = `
    <script type="application/ld+json">
      {"@type":"Movie","name":"Future Film","dateCreated":"2027-05-01","url":"/film/future-film/"}
    </script>
    <body data-type="film" data-tmdb-id="123"></body>`;
  const parsed = parseLetterboxdHtml(html, "https://letterboxd.com/film/future-film/");
  assert.equal(parsed.rating, null);
  assert.equal(parsed.ratingCount, null);
});

test("Letterboxd parser treats a zero-vote aggregate as unrated", () => {
  const html = `
    <script type="application/ld+json">
      {"@type":"Movie","name":"No Votes","dateCreated":"2026-01-01","url":"/film/no-votes/","aggregateRating":{"ratingValue":0,"ratingCount":0}}
    </script>
    <body data-type="film"></body>`;
  const parsed = parseLetterboxdHtml(html, "https://letterboxd.com/film/no-votes/");
  assert.equal(parsed.rating, null);
  assert.equal(parsed.ratingCount, 0);
});

test("Letterboxd parser preserves TMDB TV type and ignores an external JSON-LD canonical URL", () => {
  const html = `
    <script type="application/ld+json">
      {"@type":"Movie","name":"Limited Series","dateCreated":"2024-01-01","url":"https://example.com/not-safe","aggregateRating":{"ratingValue":4.1,"ratingCount":120}}
    </script>
    <body data-type="film" data-tmdb-type="tv" data-tmdb-id="456"></body>`;
  const parsed = parseLetterboxdHtml(html, "https://letterboxd.com/film/limited-series/");
  assert.equal(parsed.url, "https://letterboxd.com/film/limited-series/");
  assert.equal(parsed.tmdbType, "tv");
  assert.equal(parsed.tmdbId, "456");
});

test("Douban fallback search uses title and year instead of an unsupported suggest IMDb query", () => {
  const url = Shared.buildFallbackUrl("douban", {
    title: "Inception",
    year: 2010,
    imdbId: "tt1375666"
  });
  assert.match(url, /search_text=Inception%202010/);
  assert.doesNotMatch(url, /tt1375666/);
});

test("Douban parser prefers visible microdata rating and vote count over older JSON-LD", () => {
  const html = `
    <meta property="og:title" content="盗梦空间">
    <script type="application/ld+json">
      {
        "@type":"Movie",
        "name":"盗梦空间",
        "datePublished":"2010-09-01",
        "aggregateRating":{"ratingValue":"9.3","ratingCount":"2300000"}
      }
    </script>
    <h1><span property="v:itemreviewed">盗梦空间 Inception</span><span class="year">(2010)</span></h1>
    <div id="info"><span class="pl">IMDb:</span> tt1375666<br></div>
    <div id="interest_sectl">
      <strong class="ll rating_num" property="v:average">9.4</strong>
      <span property="v:votes">2,345,888</span>
    </div>`;
  const parsed = parseDoubanHtml(html, "https://movie.douban.com/subject/3541415/");
  assert.equal(parsed.localId, "3541415");
  assert.equal(parsed.title, "盗梦空间 Inception");
  assert.equal(parsed.year, 2010);
  assert.equal(parsed.imdbId, "tt1375666");
  assert.equal(parsed.rating, 9.4);
  assert.equal(parsed.ratingCount, 2345888);
});

test("Douban parser does not turn an unrated movie into a zero score", () => {
  const html = `
    <script type="application/ld+json">
      {"@type":"Movie","name":"尚未上映","datePublished":"2027-01-01","aggregateRating":{"ratingCount":"0"}}
    </script>
    <span property="v:itemreviewed">尚未上映</span>`;
  const parsed = parseDoubanHtml(html, "https://movie.douban.com/subject/38560280/");
  assert.equal(parsed.rating, null);
  assert.equal(parsed.ratingCount, null);
});

test("Douban parser rejects an HTTP 200 security challenge page", () => {
  const html = `<html><head><title>豆瓣安全验证</title></head><body>检测到有异常请求</body></html>`;
  assert.equal(
    parseDoubanHtml(html, "https://movie.douban.com/subject/3541415/"),
    null
  );
});

test("Douban suggest matching filters non-films and matches the English subtitle plus year", () => {
  const film = {
    title: "Inception",
    alternateTitles: [],
    year: 2010
  };
  const candidates = [
    { id: "123", type: "celebrity", title: "Inception", year: "2010", url: "https://movie.douban.com/celebrity/123/" },
    { id: "3541415", type: "movie", title: "盗梦空间", sub_title: "Inception", year: "2010", url: "https://movie.douban.com/subject/3541415/?suggest=1" },
    { id: "999", type: "movie", title: "Inception: The Cobol Job", sub_title: "", year: "2010", url: "https://movie.douban.com/subject/999/" }
  ];
  const selected = chooseDoubanCandidate(candidates, film);
  assert.equal(selected.id, "3541415");
  assert.equal(selected.url, "https://movie.douban.com/subject/3541415/");
  assert.equal(cleanDoubanCandidate(candidates[0]), null);
});

test("Douban suggest matching refuses an indistinguishable same-title, same-year tie", () => {
  const film = { title: "Twin", alternateTitles: [], year: 2020 };
  const candidates = [
    { id: "1", type: "movie", title: "Twin", year: "2020", url: "https://movie.douban.com/subject/1/" },
    { id: "2", type: "movie", title: "Twin", year: "2020", url: "https://movie.douban.com/subject/2/" }
  ];
  assert.equal(chooseDoubanCandidate(candidates, film), null);
});

test("Douban suggest matching refuses a candidate when either year is missing", () => {
  const film = { title: "Same Name", alternateTitles: [], year: 2020 };
  const candidates = [
    { id: "1", type: "movie", title: "Same Name", year: "", url: "https://movie.douban.com/subject/1/" }
  ];
  assert.equal(chooseDoubanCandidate(candidates, film), null);
});

test("Douban suggest matching refuses a merely fuzzy title even when the year matches", () => {
  const film = { title: "The Thing", alternateTitles: [], year: 1982 };
  const candidates = [
    { id: "1", type: "movie", title: "The Thing Returns", year: "1982", url: "https://movie.douban.com/subject/1/" }
  ];
  assert.equal(chooseDoubanCandidate(candidates, film), null);
});

test("observation lookup prioritizes a matching IMDb record over a newer same-title record", async () => {
  const film = {
    source: "letterboxd",
    title: "Twin",
    alternateTitles: [],
    year: 2020,
    imdbId: "tt0000001",
    tmdbId: null,
    localId: "twin"
  };
  const keys = observationKeys("douban", { ...film, localId: null });
  const now = Date.now();
  const stored = {
    [keys[0]]: { imdbId: "tt0000001", title: "Twin", year: 2020, observedAt: now - 5000, localId: "1" },
    [keys.at(-1)]: { imdbId: "tt9999999", title: "Twin", year: 2020, observedAt: now, localId: "2" }
  };
  const previousChrome = globalThis.chrome;
  globalThis.chrome = { storage: { local: { get: async () => stored } } };
  try {
    const selected = await findObservation("douban", film, 60_000);
    assert.equal(selected.localId, "1");
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});

test("observation keys keep TMDB movie and TV identifier spaces separate", () => {
  const base = {
    source: "letterboxd",
    title: "Shared ID",
    alternateTitles: [],
    year: 2024,
    imdbId: null,
    tmdbId: "123",
    localId: null
  };
  const movieKeys = observationKeys("letterboxd", { ...base, tmdbType: "movie" });
  const tvKeys = observationKeys("letterboxd", { ...base, tmdbType: "tv" });
  assert.ok(movieKeys.some((key) => key.includes("tmdb.movie.123")));
  assert.ok(tvKeys.some((key) => key.includes("tmdb.tv.123")));
  assert.notEqual(movieKeys[0], tvKeys[0]);
});

test("TMDB credentials support both read tokens and v3 API keys", () => {
  const token = tmdbRequestOptions("eyJabc.def-123");
  assert.match(token.headers.Authorization, /^Bearer eyJ/);
  assert.equal(token.query, "");

  const key = tmdbRequestOptions("0123456789abcdef");
  assert.equal(key.headers.Authorization, undefined);
  assert.equal(key.query, "api_key=0123456789abcdef");
});
