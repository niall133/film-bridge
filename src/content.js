(function initializeFilmBridgeContent() {
  "use strict";

  if (globalThis.__filmBridgeContentLoaded) return;
  globalThis.__filmBridgeContentLoaded = true;

  const Shared = globalThis.FilmBridgeShared;
  const styles = globalThis.FilmBridgeWidgetStyles;
  if (!Shared || !styles || typeof chrome === "undefined" || !chrome.runtime?.id) return;

  const ROOT_ID = "film-bridge-extension-root";
  const MAX_MOUNT_ATTEMPTS = 18;
  const RATING_DEFINITIONS = Object.freeze({
    douban: { label: "DOUBAN", max: 10, color: "#007722" },
    letterboxd: { label: "LETTERBOXD", max: 5, color: "#ff8000" },
    imdb: { label: "IMDB", max: 10, color: "#f5c518" },
    tmdb: { label: "TMDB", max: 10, color: "#01b4e4" },
    metacritic: { label: "METASCORE", max: 100, color: "#56a53f" }
  });

  let activePageKey = "";
  let activeFilmSignature = "";
  let activeRequestToken = 0;
  let lastObservedUrl = location.href;
  let lastDomIdentity = "";
  let mountTimer = null;
  let mountAttempts = 0;
  let currentSettings = Shared.normalizeSettings();
  let currentWidget = null;
  let settingsRevision = 0;
  const settingsReady = chrome.storage.local.get(Shared.SETTINGS_KEY).then((stored) => {
    if (settingsRevision === 0) currentSettings = Shared.normalizeSettings(stored[Shared.SETTINGS_KEY]);
  }).catch(() => {});

  function detectSource() {
    if (location.hostname === "movie.douban.com" && /^\/subject\/\d+\/?$/.test(location.pathname)) {
      return "douban";
    }
    if (location.hostname === "letterboxd.com" && /^\/film\/[^/]+\/?$/.test(location.pathname)) {
      return "letterboxd";
    }
    if (["imdb.com", "www.imdb.com"].includes(location.hostname)
      && /^\/title\/tt\d{5,12}(?:\/criticreviews)?\/?$/i.test(location.pathname)) {
      return "imdb";
    }
    if (["themoviedb.org", "www.themoviedb.org"].includes(location.hostname)
      && /^\/(?:movie|tv)\/\d+(?:-[^/]+)?\/?$/.test(location.pathname)) {
      return "tmdb";
    }
    if (["metacritic.com", "www.metacritic.com"].includes(location.hostname)
      && /^\/movie\/[^/]+\/?$/.test(location.pathname)) {
      return "metacritic";
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

  function readJsonLdMovies() {
    const results = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      const raw = String(script.textContent ?? "")
        .replace(/^\s*\/\*\s*<!\[CDATA\[\s*\*\/\s*/, "")
        .replace(/\s*\/\*\s*\]\]>\s*\*\/\s*$/, "")
        .trim();
      if (!raw) continue;
      try {
        for (const item of flattenJsonLd(JSON.parse(raw))) {
          const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
          if (types.some((type) => ["movie", "tvseries", "tvshow", "series"].includes(String(type).toLowerCase()))) {
            results.push(item);
          }
        }
      } catch {
        // A malformed third-party JSON-LD block must not prevent the page button.
      }
    }
    return results;
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      const value = Shared.normalizeWhitespace(document.querySelector(selector)?.textContent);
      if (value) return value;
    }
    return "";
  }

  function parseCount(value) {
    const normalized = String(value ?? "").replace(/[^\d]/g, "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseScoreText(value, max) {
    const text = Shared.normalizeWhitespace(value);
    if (!text) return null;
    const match = text.match(/(\d{1,3}(?:\.\d+)?)\s*(?:\/\s*(\d{1,3})|out of\s*(\d{1,3})|%|$)/i);
    if (!match) return null;
    const rawValue = Number(match[1]);
    const rawScale = Number(match[2] || match[3] || max);
    if (!Number.isFinite(rawValue) || !Number.isFinite(rawScale) || rawScale <= 0) return null;
    const normalized = text.includes("%") ? rawValue : rawValue * (max / rawScale);
    return Shared.finiteRating(normalized, 0.1, max);
  }

  function firstExactRating(selectors, max) {
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const text = Shared.normalizeWhitespace(element.textContent);
        if (!/^\d{1,3}(?:\.\d+)?$/.test(text)) continue;
        const rating = Shared.finiteRating(text, 0.1, max);
        if (rating != null) return rating;
      }
    }
    return null;
  }

  function isImdbReviewSectionHeading(value) {
    return /^(?:metacritic|critic|external)\s+reviews?$|^reviews?$|^criticreviews$/i.test(
      Shared.normalizeWhitespace(value)
    );
  }

  function cleanImdbPageTitle(value) {
    return Shared.cleanTitle(
      Shared.normalizeWhitespace(value)
        .replace(/\s*[-–—]\s*(?:metacritic|critic|external)\s+reviews?\s*[-–—]\s*IMDb.*$/i, "")
        .replace(/\s*[-–—]\s*IMDb\s*$/i, "")
    );
  }

  function findImdbFilmHeading() {
    const selectors = [
      '[data-testid="hero__pageTitle"]',
      '[data-testid="hero-title-block"] h1',
      'main h1',
      'main h2',
      'h1',
      'h2'
    ];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const value = cleanImdbPageTitle(element.textContent);
        if (value && !isImdbReviewSectionHeading(value)) return element;
      }
    }
    return null;
  }

  function firstImdbFilmTitle() {
    const heading = findImdbFilmHeading();
    const headingTitle = cleanImdbPageTitle(heading?.textContent);
    if (headingTitle && !isImdbReviewSectionHeading(headingTitle)) return headingTitle;
    for (const element of document.querySelectorAll('a[href*="/title/tt"]')) {
      const value = cleanImdbPageTitle(element.textContent);
      if (value && !isImdbReviewSectionHeading(value) && value.length <= 180) return value;
    }
    return "";
  }

  function extractDoubanFilm() {
    const jsonLd = readJsonLdMovies()[0] ?? null;
    const headingTitle = firstText([
      '#content h1 [property="v:itemreviewed"]',
      "#content h1 span:first-child"
    ]);
    const metaTitle = document.querySelector('meta[property="og:title"]')?.content;
    const title = Shared.cleanTitle(headingTitle || jsonLd?.name || metaTitle || document.title);
    const year = Shared.parseYear(firstText(["#content h1 .year"]))
      || Shared.parseYear(jsonLd?.datePublished)
      || Shared.parseYear(metaTitle);
    const infoText = document.querySelector("#info")?.textContent ?? "";
    const imdbId = Shared.normalizeImdbId(infoText.match(/\bIMDb\s*:\s*(tt\d{5,12})\b/i)?.[1]);
    const aliasLine = infoText.match(/(?:又名|Also known as)\s*:\s*([^\n]+)/i)?.[1] ?? "";
    const alternateTitles = Shared.uniqueStrings([
      ...aliasLine.split(/\s*\/\s*/),
      jsonLd?.alternateName,
      metaTitle,
      headingTitle
    ]).filter((candidate) => Shared.normalizeTitle(candidate) !== Shared.normalizeTitle(title));

    const domRating = Shared.finiteRating(
      firstText(['#interest_sectl [property="v:average"]', "#interest_sectl .rating_num"]),
      0.1,
      10
    );
    const domCount = parseCount(firstText(['#interest_sectl [property="v:votes"]']));
    const ldCount = parseCount(jsonLd?.aggregateRating?.ratingCount);
    const ldRating = (ldCount ?? 0) > 0
      ? Shared.finiteRating(jsonLd?.aggregateRating?.ratingValue, 0.1, 10)
      : null;
    const localId = location.pathname.match(/\/subject\/(\d+)/)?.[1] ?? null;

    return Shared.sanitizeFilmPayload({
      source: "douban",
      title,
      alternateTitles,
      year,
      imdbId,
      localId,
      rating: domRating ?? ldRating,
      ratingCount: domCount ?? ldCount,
      pageUrl: location.href
    });
  }

  function extractLetterboxdFilm() {
    const jsonLd = readJsonLdMovies()[0] ?? null;
    const domTitle = firstText([
      "h1.headline-1.primaryname .name",
      ".film-header-lockup h1.headline-1",
      "h1.headline-1"
    ]);
    const metaTitle = document.querySelector('meta[property="og:title"]')?.content;
    const title = Shared.cleanTitle(jsonLd?.name || domTitle || metaTitle || document.title);
    const year = Shared.parseYear(jsonLd?.dateCreated)
      || Shared.parseYear(firstText([".productioninfo .releasedate a", ".releaseyear a", "small.number a"]))
      || Shared.parseYear(metaTitle);
    const imdbHref = document.querySelector('a[data-track-action="IMDb"], a[href*="imdb.com/title/"]')?.href;
    const tmdbHref = document.querySelector(
      'a[data-track-action="TMDB"], a[href*="themoviedb.org/movie/"], a[href*="themoviedb.org/tv/"]'
    )?.href;
    const imdbId = Shared.normalizeImdbId(imdbHref);
    const tmdbId = Shared.normalizeTmdbId(document.body?.dataset?.tmdbId)
      || Shared.normalizeTmdbId(tmdbHref?.match(/\/(?:movie|tv)\/(\d+)/)?.[1]);
    const tmdbType = document.body?.dataset?.tmdbType === "tv" || /themoviedb\.org\/tv\//i.test(tmdbHref ?? "")
      ? "tv"
      : "movie";
    const aggregate = jsonLd?.aggregateRating;
    const metaAverage = document.querySelector('meta[name="twitter:data2"]')?.content
      ?.match(/([0-5](?:\.\d+)?)\s+out of 5/i)?.[1];
    const ratingCount = parseCount(aggregate?.ratingCount);
    const rating = (ratingCount ?? 0) > 0
      ? Shared.finiteRating(aggregate?.ratingValue, 0.1, 5)
      : Shared.finiteRating(metaAverage, 0.1, 5);
    const localId = location.pathname.match(/^\/film\/([^/]+)/)?.[1] ?? null;

    return Shared.sanitizeFilmPayload({
      source: "letterboxd",
      title,
      alternateTitles: Shared.uniqueStrings([jsonLd?.alternateName, metaTitle, domTitle])
        .filter((candidate) => Shared.normalizeTitle(candidate) !== Shared.normalizeTitle(title)),
      year,
      imdbId,
      tmdbId,
      tmdbType,
      localId,
      rating,
      ratingCount,
      pageUrl: location.href
    });
  }

  function extractImdbFilm() {
    const jsonLd = readJsonLdMovies()[0] ?? null;
    const metaTitle = document.querySelector('meta[property="og:title"]')?.content;
    const domTitle = firstImdbFilmTitle();
    const titleCandidates = [
      jsonLd?.name,
      domTitle,
      metaTitle,
      document.title
    ]
      .map(cleanImdbPageTitle)
      .filter((candidate) => candidate && !isImdbReviewSectionHeading(candidate));
    const title = titleCandidates[0] || "";
    const year = Shared.parseYear(jsonLd?.datePublished)
      || Shared.parseYear(firstText([
        '[data-testid="title-details-releasedate"]',
        'a[href*="/releaseinfo"]',
        '[data-testid="title-details-releasedate"] a'
      ]))
      || Shared.parseYear(metaTitle)
      || Shared.parseYear(document.title);
    const aggregate = jsonLd?.aggregateRating;
    const ratingCount = parseCount(aggregate?.ratingCount);
    const rating = Shared.finiteRating(aggregate?.ratingValue, 0.1, 10)
      || parseScoreText(firstText([
        '[data-testid="hero-rating-bar__aggregate-rating__score"]',
        '[data-testid*="aggregate-rating"]',
        '[class*="aggregate-rating"]'
      ]), 10);
    const imdbId = Shared.normalizeImdbId(location.pathname.match(/\/title\/(tt\d{5,12})/i)?.[1])
      || Shared.normalizeImdbId(document.querySelector('link[rel="canonical"]')?.href)
      || Shared.normalizeImdbId(document.querySelector('meta[property="og:url"]')?.content);
    const tmdbHref = document.querySelector('a[href*="themoviedb.org/"]')?.href;
    return Shared.sanitizeFilmPayload({
      source: "imdb",
      title,
      alternateTitles: Shared.uniqueStrings([jsonLd?.alternateName, metaTitle, domTitle, document.title])
        .map(cleanImdbPageTitle)
        .filter((candidate) => Shared.normalizeTitle(candidate) !== Shared.normalizeTitle(title)),
      year,
      imdbId,
      tmdbId: Shared.normalizeTmdbId(tmdbHref?.match(/\/(?:movie|tv)\/(\d+)/i)?.[1]),
      tmdbType: /\/tv\//i.test(tmdbHref ?? "") ? "tv" : "movie",
      localId: imdbId,
      rating,
      ratingCount,
      pageUrl: location.href
    });
  }

  function extractTmdbFilm() {
    const jsonLd = readJsonLdMovies()[0] ?? null;
    const pathMatch = location.pathname.match(/^\/(movie|tv)\/(\d+)/);
    const tmdbType = pathMatch?.[1] === "tv" ? "tv" : "movie";
    const tmdbId = Shared.normalizeTmdbId(pathMatch?.[2]);
    const domTitle = firstText([
      "h2.title",
      '[data-testid="hero__pageTitle"]',
      "main h1",
      "main h2",
      "h1"
    ]);
    const metaTitle = document.querySelector('meta[property="og:title"]')?.content;
    const title = Shared.cleanTitle(jsonLd?.name || domTitle || metaTitle || document.title);
    const year = Shared.parseYear(jsonLd?.datePublished)
      || Shared.parseYear(firstText([
        ".release_date",
        '[class*="release_date"]',
        '[data-testid*="release"]'
      ]))
      || Shared.parseYear(metaTitle);
    const aggregate = jsonLd?.aggregateRating;
    const ratingCount = parseCount(aggregate?.ratingCount);
    const chartPercent = document.querySelector("[data-percent]")?.getAttribute("data-percent");
    const chartRating = chartPercent == null ? null : Shared.finiteRating(Number(chartPercent) / 10, 0.1, 10);
    const rating = Shared.finiteRating(aggregate?.ratingValue, 0.1, 10)
      || chartRating
      || parseScoreText(firstText([
        ".user_score",
        ".user_score_chart",
        '[data-testid*="user-score"]',
        '[data-testid*="rating"]'
      ]), 10);
    const infoText = firstText([
      ".user_score",
      ".user_score_chart",
      '[data-testid*="user-score"]',
      '[data-testid*="rating"]'
    ]);
    const visibleCount = parseCount(infoText.match(/([\d,]+)\s*(?:votes?|ratings?)/i)?.[1]);
    const imdbHref = document.querySelector('a[href*="imdb.com/title/"]')?.href;
    return Shared.sanitizeFilmPayload({
      source: "tmdb",
      title,
      alternateTitles: Shared.uniqueStrings([jsonLd?.alternateName, metaTitle, domTitle])
        .filter((candidate) => Shared.normalizeTitle(candidate) !== Shared.normalizeTitle(title)),
      year,
      imdbId: Shared.normalizeImdbId(imdbHref),
      tmdbId,
      tmdbType,
      localId: `${tmdbType}-${tmdbId || ""}`,
      rating,
      ratingCount: ratingCount ?? visibleCount,
      pageUrl: location.href
    });
  }

  function extractMetacriticFilm() {
    const jsonLd = readJsonLdMovies()[0] ?? null;
    const heading = document.querySelector("main h1") || document.querySelector("h1");
    const domTitle = Shared.normalizeWhitespace(heading?.textContent);
    const metaTitle = document.querySelector('meta[property="og:title"]')?.content || document.title;
    const metaMovieTitle = Shared.normalizeWhitespace(metaTitle)
      .replace(/\s+(?:Reviews?|Details)\s*[-–—]\s*Metacritic.*$/i, "")
      .replace(/\s*[-–—]\s*Metacritic.*$/i, "");
    const title = Shared.cleanTitle(jsonLd?.name || domTitle || metaMovieTitle);
    const headingContext = Shared.normalizeWhitespace(heading?.parentElement?.textContent);
    const mainText = Shared.normalizeWhitespace(document.querySelector("main")?.textContent);
    const year = Shared.parseYear(jsonLd?.datePublished)
      || Shared.parseYear(headingContext)
      || Shared.parseYear(mainText);
    const metaDescription = document.querySelector('meta[name="description"]')?.content
      || document.querySelector('meta[property="og:description"]')?.content;
    const rating = firstExactRating([
        '[data-testid*="metascore"]',
        '[class*="productScoreInfo_scoreNumber"]',
        '[class*="siteReviewScore_background"]',
        '[class*="metascore"] [class*="score"]',
        '[class*="critic"] [class*="score"]'
      ], 100)
      || Shared.finiteRating(
        String(metaDescription ?? "").match(/Metascore\D{0,24}(\d{1,3})/i)?.[1],
        0.1,
        100
      );
    const ratingCount = parseCount(
      mainText.match(/Based on\s+([\d,]+)\s+Critic Reviews?/i)?.[1]
      || jsonLd?.aggregateRating?.ratingCount
    );
    const pageMarkup = document.documentElement?.innerHTML ?? "";
    const imdbId = Shared.normalizeImdbId(
      document.querySelector('a[href*="imdb.com/title/"]')?.href
      || pageMarkup.match(/(?:imdbTitleId|imdbId|imdb_id)[\s\S]{0,80}?(tt\d{7,12})/i)?.[1]
    );
    const localId = location.pathname.match(/^\/movie\/([^/]+)/)?.[1] ?? null;

    return Shared.sanitizeFilmPayload({
      source: "metacritic",
      title,
      alternateTitles: Shared.uniqueStrings([jsonLd?.alternateName, metaMovieTitle, domTitle])
        .filter((candidate) => Shared.normalizeTitle(candidate) !== Shared.normalizeTitle(title)),
      year,
      imdbId,
      localId,
      rating,
      ratingCount,
      pageUrl: location.href
    });
  }

  function extractFilm(source) {
    if (source === "douban") return extractDoubanFilm();
    if (source === "letterboxd") return extractLetterboxdFilm();
    if (source === "imdb") return extractImdbFilm();
    if (source === "tmdb") return extractTmdbFilm();
    if (source === "metacritic") return extractMetacriticFilm();
    return null;
  }

  function pageDomMatchesLocation(source) {
    const jsonLd = readJsonLdMovies()[0] ?? null;
    const canonicalValue = jsonLd?.url
      || jsonLd?.["@id"]
      || document.querySelector('meta[property="og:url"]')?.content
      || document.querySelector('link[rel="canonical"]')?.href;
    if (!canonicalValue) return true;

    try {
      const canonical = new URL(canonicalValue, location.origin);
      if (source === "douban") {
        const expectedId = location.pathname.match(/^\/subject\/(\d+)\/?$/)?.[1];
        const documentId = canonical.pathname.match(/^\/subject\/(\d+)\/?$/)?.[1];
        return !documentId || documentId === expectedId;
      }
      if (source === "letterboxd") {
        const expectedPath = location.pathname.replace(/\/+$/, "");
        const documentPath = canonical.pathname.replace(/\/+$/, "");
        return !documentPath.startsWith("/film/") || documentPath === expectedPath;
      }
      if (source === "imdb") {
        const expectedId = location.pathname.match(/^\/title\/(tt\d{5,12})/i)?.[1]?.toLowerCase();
        const documentId = canonical.pathname.match(/^\/title\/(tt\d{5,12})/i)?.[1]?.toLowerCase();
        return !documentId || documentId === expectedId;
      }
      if (source === "metacritic") {
        const expectedPath = location.pathname.replace(/\/+$/, "");
        const documentPath = canonical.pathname.replace(/\/+$/, "");
        return !documentPath.startsWith("/movie/") || documentPath === expectedPath;
      }
      const expected = location.pathname.match(/^\/(movie|tv)\/(\d+)/);
      const documentPath = canonical.pathname.match(/^\/(movie|tv)\/(\d+)/);
      return !documentPath || (expected?.[1] === documentPath?.[1] && expected?.[2] === documentPath?.[2]);
    } catch {
      return true;
    }
  }

  function filmSignature(film) {
    return [
      film.source,
      Shared.normalizeTitle(film.title),
      film.year || "",
      film.imdbId || "",
      film.tmdbId || "",
      film.tmdbType || "movie",
      film.localId || ""
    ].join(":");
  }

  function domIdentityHint(source = detectSource()) {
    if (!source) return `unsupported:${location.pathname}`;
    const selectors = {
      douban: ['#content h1 [property="v:itemreviewed"]', "#content h1"],
      letterboxd: ["h1.headline-1.primaryname .name", ".film-header-lockup h1", "h1.headline-1"],
      imdb: ['[data-testid="hero__pageTitle"]', '[data-testid="hero-title-block"] h1', "main h1", "h1"],
      tmdb: ["h2.title", '[data-testid="hero__pageTitle"]', "main h1", "main h2", "h1"],
      metacritic: ["main h1", '[class*="product_title"]', "h1"]
    };
    const heading = firstText(selectors[source] || []);
    return `${source}:${location.pathname}:${Shared.normalizeTitle(heading)}`;
  }

  function findMount(source) {
    if (source === "douban") {
      return document.querySelector("#content h1") || document.querySelector("#content");
    }

    if (source === "letterboxd") {
      return document.querySelector(".production-masthead")
        || document.querySelector(".film-header-lockup")
        || document.querySelector("h1.headline-1")
        || document.querySelector("#film-page-wrapper");
    }
    if (source === "imdb") {
      return findImdbFilmHeading()
        || document.querySelector('[data-testid="hero__pageTitle"]')
        || document.querySelector('[data-testid="hero-title-block"]')
        || document.querySelector("main h1")
        || document.querySelector("main h2")
        || document.querySelector("h1");
    }
    if (source === "metacritic") {
      return document.querySelector("main h1")
        || document.querySelector('[class*="product_title"]')
        || document.querySelector('[class*="productHero"] h1')
        || document.querySelector("h1");
    }
    return document.querySelector("h2.title")
      || document.querySelector('[data-testid="hero__pageTitle"]')
      || document.querySelector("main h1")
      || document.querySelector("main h2")
      || document.querySelector("#media_v4");
  }

  function insertAfter(reference, element) {
    if (reference?.parentNode) {
      reference.parentNode.insertBefore(element, reference.nextSibling);
      return true;
    }
    return false;
  }

  function createRatingElement(key) {
    const definition = RATING_DEFINITIONS[key];
    const element = document.createElement("a");
    element.className = "rating";
    element.dataset.rating = key;
    element.dataset.link = "false";
    element.style.setProperty("--rating-color", definition.color);
    element.setAttribute("role", "listitem");
    element.innerHTML = `
      <span class="rating-name"></span>
      <strong class="rating-value">—</strong>
      <span class="rating-scale"></span>
      <span class="rating-arrow" aria-hidden="true">↗</span>
    `;
    element.querySelector(".rating-name").textContent = definition.label;
    element.querySelector(".rating-scale").textContent = `/ ${definition.max}`;
    element.addEventListener("click", () => {
      if (element.dataset.link !== "true") return;
      element.classList.remove("is-activating");
      void element.offsetWidth;
      element.classList.add("is-activating");
      setTimeout(() => element.classList.remove("is-activating"), 460);
    });
    return element;
  }

  function createWidget(host, film) {
    const shadow = host.attachShadow({ mode: "open" });
    const source = film.source;
    const targetSite = source === "douban" ? "letterboxd" : "douban";
    const fallbackUrl = Shared.buildFallbackUrl(targetSite, film);

    shadow.innerHTML = `
      <style></style>
      <section class="ticket" aria-label="跨站电影评分" data-source="${source}">
        <div class="ratings" role="list" aria-label="电影评分"></div>
        <span class="sr-status" role="status" aria-live="polite"></span>
      </section>
    `;
    shadow.querySelector("style").textContent = styles;

    const ratingsContainer = shadow.querySelector(".ratings");
    for (const key of Object.keys(RATING_DEFINITIONS)) {
      const ratingElement = createRatingElement(key);
      if (["imdb", "tmdb", "metacritic"].includes(key)) ratingElement.hidden = true;
      ratingsContainer.append(ratingElement);
    }

    const currentRating = shadow.querySelector(`[data-rating="${source}"]`);
    const targetRating = shadow.querySelector(`[data-rating="${targetSite}"]`);
    currentRating.dataset.current = "true";
    setRatingLink(currentRating, null, source, false, false);
    setRatingLink(targetRating, fallbackUrl, targetSite, true, true);
    updateRatingElement(currentRating, {
      value: film.rating,
      max: RATING_DEFINITIONS[source].max,
      count: film.ratingCount
    }, false);
    updateRatingElement(targetRating, null, true);

    const widget = { host, shadow, targetSite, fallbackUrl, source, film, response: null };
    applyResolution(widget, null, film);
    updateRatingElement(targetRating, null, true);
    return widget;
  }

  function setRatingLink(element, url, key, isLink, openInNewTab) {
    if (!element) return;
    const definition = RATING_DEFINITIONS[key];
    if (isLink && url) {
      element.href = url;
      element.target = openInNewTab ? "_blank" : "_self";
      element.rel = "noopener noreferrer";
      element.dataset.link = "true";
      element.setAttribute("role", "link");
      element.removeAttribute("aria-disabled");
      element.removeAttribute("tabindex");
      element.setAttribute(
        "aria-label",
        `在 ${definition.label} 查看电影详情${openInNewTab ? "（新标签页）" : ""}`
      );
      return;
    }
    element.removeAttribute("href");
    element.removeAttribute("target");
    element.removeAttribute("rel");
    element.dataset.link = "false";
    element.setAttribute("role", "listitem");
    element.setAttribute("aria-disabled", "true");
    element.setAttribute("tabindex", "-1");
  }

  function updateRatingElement(element, rating, loading = false) {
    if (!element) return;
    const key = element.dataset.rating;
    const definition = RATING_DEFINITIONS[key];
    const valueNode = element.querySelector(".rating-value");
    const scaleNode = element.querySelector(".rating-scale");
    element.dataset.loading = String(Boolean(loading));
    delete element.dataset.scoreBand;

    if (loading) {
      valueNode.textContent = "···";
      scaleNode.textContent = `/ ${definition.max}`;
      element.setAttribute("aria-label", `${definition.label} 正在加载`);
      element.removeAttribute("title");
      return;
    }

    const formatted = Shared.formatRating(rating?.value, rating?.max ?? definition.max);
    valueNode.textContent = formatted ?? "—";
    scaleNode.textContent = `/ ${rating?.max ?? definition.max}`;
    if (key === "metacritic" && formatted) {
      const numeric = Number(rating?.value);
      element.dataset.scoreBand = numeric >= 61 ? "high" : numeric >= 40 ? "mid" : "low";
    }
    const accessibleLabel = formatted
      ? `${definition.label} ${formatted} / ${rating?.max ?? definition.max}`
      : `${definition.label} 暂无评分`;
    const currentHint = element.dataset.current === "true" ? "，当前页面评分" : "";
    const hasRatingCount = rating?.count != null && Number.isFinite(Number(rating.count));
    element.setAttribute("aria-label", hasRatingCount && formatted
      ? `${accessibleLabel}，${Number(rating.count).toLocaleString("zh-CN")} 人评分${currentHint}`
      : `${accessibleLabel}${currentHint}`);
    if (!formatted) {
      element.title = "暂无评分";
    } else if (hasRatingCount) {
      element.title = `${Number(rating.count).toLocaleString("zh-CN")} 人评分`;
    } else {
      element.removeAttribute("title");
    }
  }

  function applyResolution(widget, response, film) {
    const { shadow, targetSite, fallbackUrl } = widget;
    const srStatus = shadow.querySelector(".sr-status");
    const target = response?.target;
    const targetUrl = target?.url || fallbackUrl;

    const openInNewTab = currentSettings.openInNewTab;
    setRatingLink(
      shadow.querySelector(`[data-rating="${targetSite}"]`),
      targetUrl,
      targetSite,
      true,
      openInNewTab
    );

    const showRatings = Shared.hasEnabledRatings(currentSettings);

    for (const [key, definition] of Object.entries(RATING_DEFINITIONS)) {
      const element = shadow.querySelector(`[data-rating="${key}"]`);
      const rating = key === film.source && film.rating != null
        ? { value: film.rating, max: definition.max, count: film.ratingCount }
        : response?.ratings?.[key] || null;
      const external = ["imdb", "tmdb", "metacritic"].includes(key);
      const isCurrentSite = key === film.source;
      element.hidden = !showRatings
        || !currentSettings.ratingVisibility[key]
        || (external && !rating && !response?.configured?.[key] && !isCurrentSite);
      element.dataset.current = String(isCurrentSite);
      const ratingUrl = key === targetSite
        ? targetUrl
        : rating?.url || null;
      setRatingLink(element, ratingUrl, key, !isCurrentSite && Boolean(ratingUrl), openInNewTab);
      updateRatingElement(element, rating, false);
    }

    // Collapse the host too: hiding only the inner elements leaves an empty ticket and margins.
    const hasVisibleCards = [...shadow.querySelectorAll(".rating")].some((element) => !element.hidden);
    widget.host.hidden = !hasVisibleCards;
    shadow.querySelector(".ticket").hidden = !hasVisibleCards;
    shadow.querySelector(".ratings").hidden = !hasVisibleCards;

    if (target?.direct) {
      const matchLabels = {
        imdb: "IMDb ID",
        tmdb: "TMDB ID",
        title_year: "片名与年份",
        observed_cache: "本地访问记录"
      };
      srStatus.textContent = target.verified === false
        ? `${matchLabels[target.matchedBy] || "影片"}直达入口已就绪，评分暂未取到`
        : `已通过${matchLabels[target.matchedBy] || "影片信息"}精准匹配`;
    } else {
      srStatus.textContent = `暂未确认唯一条目，点击将在 ${Shared.SITES[targetSite].label} 搜索`;
    }
  }

  function applyResolutionError(widget) {
    widget.shadow.querySelector(".sr-status").textContent = "评分暂时不可用；跳转入口仍可正常使用";
    updateRatingElement(widget.shadow.querySelector(`[data-rating="${widget.targetSite}"]`), null, false);
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(response ?? null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function mountForCurrentPage() {
    await settingsReady;
    const source = detectSource();
    if (!source) {
      document.getElementById(ROOT_ID)?.remove();
      activePageKey = "";
      activeFilmSignature = "";
      mountAttempts = 0;
      currentWidget = null;
      return;
    }

    if (!Shared.hasEnabledRatings(currentSettings)) {
      if (currentWidget?.host.isConnected) applyResolution(currentWidget, currentWidget.response, currentWidget.film);
      return;
    }

    if (!pageDomMatchesLocation(source)) {
      mountAttempts += 1;
      if (mountAttempts < MAX_MOUNT_ATTEMPTS) scheduleMount(Math.min(900, 180 + mountAttempts * 45));
      return;
    }

    const film = extractFilm(source);
    const mount = findMount(source);
    if (!film || !mount) {
      mountAttempts += 1;
      if (mountAttempts < MAX_MOUNT_ATTEMPTS) scheduleMount(Math.min(900, 180 + mountAttempts * 45));
      return;
    }

    const pageKey = `${source}:${film.localId || location.pathname}`;
    const signature = filmSignature(film);
    const existing = document.getElementById(ROOT_ID);
    if (activePageKey === pageKey && activeFilmSignature === signature && existing?.isConnected) return;

    activePageKey = pageKey;
    activeFilmSignature = signature;
    lastDomIdentity = domIdentityHint(source);
    activeRequestToken += 1;
    const requestToken = activeRequestToken;
    existing?.remove();

    const host = document.createElement("div");
    host.id = ROOT_ID;
    host.hidden = true;
    host.dataset.filmBridgeOwned = "true";
    host.style.display = "block";
    host.style.clear = "both";
    host.style.width = "min(100%, 720px)";
    host.style.maxWidth = "720px";
    host.style.margin = "16px 0 32px";
    if (source === "imdb" && /\/criticreviews\/?$/i.test(location.pathname)) {
      host.dataset.layout = "imdb-critic";
      host.style.clear = "none";
      host.style.width = "min(52vw, 720px)";
      host.style.maxWidth = "720px";
      host.style.margin = "0 0 26px auto";
      host.style.float = "right";
    }

    if (!insertAfter(mount, host)) {
      mountAttempts += 1;
      if (mountAttempts < MAX_MOUNT_ATTEMPTS) scheduleMount(300);
      return;
    }

    mountAttempts = 0;
    const widget = createWidget(host, film);
    currentWidget = widget;
    await resolveWidget(widget, requestToken);
  }

  async function resolveWidget(widget, requestToken = ++activeRequestToken) {
    const response = await sendRuntimeMessage({
      type: "FILM_BRIDGE_RESOLVE",
      payload: widget.film
    });

    if (requestToken !== activeRequestToken || !widget.host.isConnected) return;
    if (response?.ok) {
      widget.response = response;
      applyResolution(widget, response, widget.film);
    }
    else applyResolutionError(widget);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const settingsChange = changes[Shared.SETTINGS_KEY];
    const credentialsChange = changes["filmBridge.credentials.v1"];
    if (!settingsChange && !credentialsChange) return;
    if (settingsChange) {
      settingsRevision += 1;
      currentSettings = Shared.normalizeSettings(settingsChange.newValue);
    }
    activeRequestToken += 1;
    if (currentWidget?.host.isConnected) {
      applyResolution(currentWidget, currentWidget.response, currentWidget.film);
      if (Shared.hasEnabledRatings(currentSettings)) {
        resolveWidget(currentWidget).catch(() => {});
      }
    } else if (Shared.hasEnabledRatings(currentSettings)) {
      mountAttempts = 0;
      scheduleMount(0);
    }
  });

  function scheduleMount(delay = 80) {
    clearTimeout(mountTimer);
    mountTimer = setTimeout(() => {
      mountForCurrentPage().catch(() => {
        // The immediate fallback link remains useful even if enrichment fails.
      });
    }, delay);
  }

  const observer = new MutationObserver(() => {
    const source = detectSource();
    const urlChanged = location.href !== lastObservedUrl;
    const recoveredAfterExhaustion = Boolean(
      source
      && Shared.hasEnabledRatings(currentSettings)
      && mountAttempts >= MAX_MOUNT_ATTEMPTS
      && !document.getElementById(ROOT_ID)
      && findMount(source)
      && pageDomMatchesLocation(source)
    );
    if (recoveredAfterExhaustion) mountAttempts = 0;
    const rootMissing = Boolean(source)
      && Shared.hasEnabledRatings(currentSettings)
      && mountAttempts < MAX_MOUNT_ATTEMPTS
      && !document.getElementById(ROOT_ID);
    const nextDomIdentity = domIdentityHint(source);
    const filmIdentityChanged = nextDomIdentity !== lastDomIdentity;
    if (urlChanged) {
      document.getElementById(ROOT_ID)?.remove();
      currentWidget = null;
      lastObservedUrl = location.href;
      activePageKey = "";
      activeFilmSignature = "";
      mountAttempts = 0;
      activeRequestToken += 1;
    }
    if (filmIdentityChanged) {
      lastDomIdentity = nextDomIdentity;
      mountAttempts = 0;
    }
    if (urlChanged || rootMissing || filmIdentityChanged) scheduleMount(urlChanged ? 80 : 180);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("pageshow", () => scheduleMount(0));
  window.addEventListener("popstate", () => scheduleMount(0));

  // Some Letterboxd navigation flows update history before their DOM mutation batch.
  setInterval(() => {
    if (location.href !== lastObservedUrl) {
      document.getElementById(ROOT_ID)?.remove();
      currentWidget = null;
      lastObservedUrl = location.href;
      activePageKey = "";
      activeFilmSignature = "";
      mountAttempts = 0;
      activeRequestToken += 1;
      scheduleMount(0);
    }
  }, 1000);

  scheduleMount(0);
})();
