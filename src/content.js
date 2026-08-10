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
  const PRIMARY_RATING_KEYS = new Set(["douban", "letterboxd"]);

  let activePageKey = "";
  let activeFilmSignature = "";
  let activeRequestToken = 0;
  let lastObservedUrl = location.href;
  let lastDomIdentity = "";
  let mountTimer = null;
  let mountAttempts = 0;

  function detectSource() {
    if (location.hostname === "movie.douban.com" && /^\/subject\/\d+\/?$/.test(location.pathname)) {
      return "douban";
    }
    if (location.hostname === "letterboxd.com" && /^\/film\/[^/]+\/?$/.test(location.pathname)) {
      return "letterboxd";
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
          if (types.some((type) => String(type).toLowerCase() === "movie")) results.push(item);
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

  function extractFilm(source) {
    return source === "douban" ? extractDoubanFilm() : extractLetterboxdFilm();
  }

  function pageDomMatchesLocation(source) {
    const jsonLd = readJsonLdMovies()[0] ?? null;
    const canonicalValue = jsonLd?.url
      || jsonLd?.["@id"]
      || document.querySelector('meta[property="og:url"]')?.content;
    if (!canonicalValue) return true;

    try {
      const canonical = new URL(canonicalValue, location.origin);
      if (source === "douban") {
        const expectedId = location.pathname.match(/^\/subject\/(\d+)\/?$/)?.[1];
        const documentId = canonical.pathname.match(/^\/subject\/(\d+)\/?$/)?.[1];
        return !documentId || documentId === expectedId;
      }
      const expectedPath = location.pathname.replace(/\/+$/, "");
      const documentPath = canonical.pathname.replace(/\/+$/, "");
      return !documentPath.startsWith("/film/") || documentPath === expectedPath;
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
    const heading = source === "douban"
      ? firstText(['#content h1 [property="v:itemreviewed"]', "#content h1"])
      : firstText(["h1.headline-1.primaryname .name", ".film-header-lockup h1", "h1.headline-1"]);
    return `${source}:${location.pathname}:${Shared.normalizeTitle(heading)}`;
  }

  function findMount(source) {
    if (source === "douban") {
      return document.querySelector("#content h1") || document.querySelector("#content");
    }

    return document.querySelector(".production-masthead")
      || document.querySelector(".film-header-lockup")
      || document.querySelector("h1.headline-1")
      || document.querySelector("#film-page-wrapper");
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
    const element = document.createElement("div");
    element.className = "rating";
    element.dataset.rating = key;
    element.style.setProperty("--rating-color", definition.color);
    element.setAttribute("role", "listitem");
    element.innerHTML = `
      <span class="rating-name"></span>
      <strong class="rating-value">—</strong>
      <span class="rating-scale"></span>
    `;
    element.querySelector(".rating-name").textContent = definition.label;
    element.querySelector(".rating-scale").textContent = `/ ${definition.max}`;
    return element;
  }

  function createWidget(host, film) {
    const shadow = host.attachShadow({ mode: "open" });
    const source = film.source;
    const targetSite = source === "douban" ? "letterboxd" : "douban";
    const targetLabel = Shared.SITES[targetSite].label;
    const fallbackUrl = Shared.buildFallbackUrl(targetSite, film);

    shadow.innerHTML = `
      <style></style>
      <section class="ticket" aria-label="跨站电影评分" data-source="${source}">
        <div class="ratings" role="list" aria-label="电影评分"></div>
        <div class="actions">
          <a class="jump" rel="noopener noreferrer" data-jump>
            <span data-button-target></span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>
          </a>
        </div>
        <span class="sr-status" role="status" aria-live="polite"></span>
      </section>
    `;
    shadow.querySelector("style").textContent = styles;
    shadow.querySelector("[data-button-target]").textContent = targetLabel;

    const ratingsContainer = shadow.querySelector(".ratings");
    for (const key of Object.keys(RATING_DEFINITIONS)) {
      const ratingElement = createRatingElement(key);
      if (["imdb", "tmdb", "metacritic"].includes(key)) ratingElement.hidden = true;
      ratingsContainer.append(ratingElement);
    }

    const jump = shadow.querySelector("[data-jump]");
    jump.href = fallbackUrl;
    jump.target = "_blank";
    jump.setAttribute("aria-label", `在 ${targetLabel} 查看（新标签页）`);

    const currentRating = shadow.querySelector(`[data-rating="${source}"]`);
    const targetRating = shadow.querySelector(`[data-rating="${targetSite}"]`);
    updateRatingElement(currentRating, {
      value: film.rating,
      max: RATING_DEFINITIONS[source].max,
      count: film.ratingCount
    }, false);
    updateRatingElement(targetRating, null, true);

    return { shadow, jump, targetSite, fallbackUrl };
  }

  function updateRatingElement(element, rating, loading = false) {
    if (!element) return;
    const key = element.dataset.rating;
    const definition = RATING_DEFINITIONS[key];
    const valueNode = element.querySelector(".rating-value");
    const scaleNode = element.querySelector(".rating-scale");
    element.dataset.loading = String(Boolean(loading));

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
    const accessibleLabel = formatted
      ? `${definition.label} ${formatted} / ${rating?.max ?? definition.max}`
      : `${definition.label} 暂无评分`;
    const hasRatingCount = rating?.count != null && Number.isFinite(Number(rating.count));
    element.setAttribute("aria-label", hasRatingCount && formatted
      ? `${accessibleLabel}，${Number(rating.count).toLocaleString("zh-CN")} 人评分`
      : accessibleLabel);
    if (!formatted) {
      element.title = "暂无评分";
    } else if (hasRatingCount) {
      element.title = `${Number(rating.count).toLocaleString("zh-CN")} 人评分`;
    } else {
      element.removeAttribute("title");
    }
  }

  function isPrimaryRatingVisible(key, source, settings) {
    if (!PRIMARY_RATING_KEYS.has(key)) return true;
    const mode = settings?.ratingDisplay?.[source];
    return mode === "douban" || mode === "letterboxd" ? mode === key : true;
  }

  function applyResolution(widget, response, film) {
    const { shadow, jump, targetSite, fallbackUrl } = widget;
    const srStatus = shadow.querySelector(".sr-status");
    const target = response?.target;
    const targetUrl = target?.url || fallbackUrl;
    jump.href = targetUrl;

    const openInNewTab = response?.settings?.openInNewTab !== false;
    jump.target = openInNewTab ? "_blank" : "_self";
    jump.setAttribute(
      "aria-label",
      `在 ${Shared.SITES[targetSite].label} 查看${openInNewTab ? "（新标签页）" : ""}`
    );

    const showRatings = response?.settings?.showRatings !== false;
    shadow.querySelector(".ratings").hidden = !showRatings;

    for (const [key, definition] of Object.entries(RATING_DEFINITIONS)) {
      const element = shadow.querySelector(`[data-rating="${key}"]`);
      const rating = response?.ratings?.[key]
        || (key === film.source && film.rating != null
          ? { value: film.rating, max: definition.max, count: film.ratingCount }
          : null);
      const external = ["imdb", "tmdb", "metacritic"].includes(key);
      element.hidden = !showRatings
        || !isPrimaryRatingVisible(key, film.source, response?.settings)
        || (external && !rating && !response?.configured?.[key]);
      updateRatingElement(element, rating, false);
    }

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
    const source = detectSource();
    if (!source) {
      document.getElementById(ROOT_ID)?.remove();
      activePageKey = "";
      activeFilmSignature = "";
      mountAttempts = 0;
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
    host.dataset.filmBridgeOwned = "true";
    host.style.display = "block";
    host.style.clear = "both";
    host.style.width = "min(100%, 720px)";
    host.style.maxWidth = "720px";
    host.style.margin = "16px 0 32px";

    if (!insertAfter(mount, host)) {
      mountAttempts += 1;
      if (mountAttempts < MAX_MOUNT_ATTEMPTS) scheduleMount(300);
      return;
    }

    mountAttempts = 0;
    const widget = createWidget(host, film);
    const response = await sendRuntimeMessage({
      type: "FILM_BRIDGE_RESOLVE",
      payload: film
    });

    if (requestToken !== activeRequestToken || !host.isConnected) return;
    if (response?.ok) applyResolution(widget, response, film);
    else applyResolutionError(widget);
  }

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
      && mountAttempts >= MAX_MOUNT_ATTEMPTS
      && !document.getElementById(ROOT_ID)
      && findMount(source)
      && pageDomMatchesLocation(source)
    );
    if (recoveredAfterExhaustion) mountAttempts = 0;
    const rootMissing = Boolean(source)
      && mountAttempts < MAX_MOUNT_ATTEMPTS
      && !document.getElementById(ROOT_ID);
    const nextDomIdentity = domIdentityHint(source);
    const filmIdentityChanged = nextDomIdentity !== lastDomIdentity;
    if (urlChanged) {
      document.getElementById(ROOT_ID)?.remove();
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
