"use strict";

const SETTINGS_KEY = "filmBridge.settings.v1";
const CREDENTIALS_KEY = "filmBridge.credentials.v1";
const DEFAULT_SETTINGS = Object.freeze({
  openInNewTab: true,
  showRatings: true,
  cacheHours: 24,
  ratingDisplay: Object.freeze({
    douban: "both",
    letterboxd: "both"
  }),
  externalRatingDisplay: Object.freeze({
    imdb: true,
    tmdb: true,
    metacritic: true
  }),
  ratingVisibility: Object.freeze({
    douban: true,
    letterboxd: true,
    imdb: true,
    tmdb: true,
    metacritic: true
  })
});
const RATING_DISPLAY_MODES = new Set(["both", "douban", "letterboxd"]);
const RATING_KEYS = ["douban", "letterboxd", "imdb", "tmdb", "metacritic"];

const form = document.getElementById("settings-form");
const openInNewTab = document.getElementById("open-in-new-tab");
const showRatings = document.getElementById("show-ratings");
const ratingSwitches = Object.fromEntries(
  [...document.querySelectorAll("[data-rating-switch]")].map((input) => [input.dataset.ratingSwitch, input])
);
const ratingVisibilityControls = document.getElementById("rating-visibility-controls");
const ratingVisibilityStatus = document.getElementById("rating-visibility-status");
const cacheHours = document.getElementById("cache-hours");
const omdbKey = document.getElementById("omdb-key");
const tmdbCredential = document.getElementById("tmdb-credential");
const status = document.getElementById("status");

function setStatus(message, tone = "") {
  status.textContent = message;
  status.className = tone;
}

function legacyVisibility(settings) {
  const ratingDisplay = settings.ratingDisplay && typeof settings.ratingDisplay === "object"
    ? settings.ratingDisplay
    : {};
  const external = settings.externalRatingDisplay && typeof settings.externalRatingDisplay === "object"
    ? settings.externalRatingDisplay
    : {};
  return {
    douban: ratingDisplay.douban === "letterboxd" ? false : true,
    letterboxd: ratingDisplay.letterboxd === "douban" ? false : true,
    imdb: external.imdb !== false,
    tmdb: external.tmdb !== false,
    metacritic: external.metacritic !== false
  };
}

function readRatingVisibility(settings) {
  const fallback = legacyVisibility(settings);
  const saved = settings.ratingVisibility && typeof settings.ratingVisibility === "object"
    ? settings.ratingVisibility
    : {};
  return Object.fromEntries(RATING_KEYS.map((key) => [
    key,
    Object.prototype.hasOwnProperty.call(saved, key) ? saved[key] !== false : fallback[key]
  ]));
}

function updateRatingVisibilityStatus() {
  const values = RATING_KEYS.map((key) => Boolean(ratingSwitches[key]?.checked));
  const enabled = values.filter(Boolean).length;
  const allOff = enabled === 0;
  const allOn = enabled === RATING_KEYS.length;
  ratingVisibilityControls.dataset.allOff = String(allOff);
  ratingVisibilityStatus.textContent = allOff
    ? "已关闭全部评分来源"
    : allOn ? "5 个评分来源均已开启" : `已开启 ${enabled} / ${RATING_KEYS.length} 个评分来源`;
}

function setAllRatingVisibility(checked) {
  for (const key of RATING_KEYS) {
    if (ratingSwitches[key]) ratingSwitches[key].checked = checked;
  }
  updateRatingVisibilityStatus();
}

function containsPermission(origin) {
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: [origin] }, resolve);
  });
}

function requestPermissions(origins) {
  if (!origins.length) return Promise.resolve(true);
  return new Promise((resolve) => {
    chrome.permissions.request({ origins }, resolve);
  });
}

function removePermission(origin) {
  return new Promise((resolve) => {
    try {
      chrome.permissions.remove({ origins: [origin] }, (removed) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(Boolean(removed));
      });
    } catch {
      resolve(false);
    }
  });
}

async function persistCredentials(omdbValue, tmdbValue) {
  const credentials = {};
  if (omdbValue) credentials.omdbApiKey = omdbValue;
  if (tmdbValue) credentials.tmdbCredential = tmdbValue;

  if (Object.keys(credentials).length) {
    await chrome.storage.local.set({ [CREDENTIALS_KEY]: credentials });
  } else {
    await chrome.storage.local.remove(CREDENTIALS_KEY);
  }

  if (!omdbValue && await containsPermission("https://www.omdbapi.com/*")) {
    await removePermission("https://www.omdbapi.com/*");
  }
  if (!tmdbValue && await containsPermission("https://api.themoviedb.org/*")) {
    await removePermission("https://api.themoviedb.org/*");
  }
}

async function removeStoredCredential(key, origin) {
  const stored = await chrome.storage.local.get(CREDENTIALS_KEY);
  const credentials = { ...(stored[CREDENTIALS_KEY] ?? {}) };
  delete credentials[key];
  if (Object.keys(credentials).length) {
    await chrome.storage.local.set({ [CREDENTIALS_KEY]: credentials });
  } else {
    await chrome.storage.local.remove(CREDENTIALS_KEY);
  }
  if (await containsPermission(origin)) await removePermission(origin);
  return !(await containsPermission(origin));
}

async function refreshPermissionLabels() {
  const [hasOmdb, hasTmdb] = await Promise.all([
    containsPermission("https://www.omdbapi.com/*"),
    containsPermission("https://api.themoviedb.org/*")
  ]);
  const omdbLabel = document.getElementById("omdb-permission");
  const tmdbLabel = document.getElementById("tmdb-permission");
  omdbLabel.textContent = hasOmdb ? "已授权" : "未启用";
  tmdbLabel.textContent = hasTmdb ? "已授权" : "未启用";
  omdbLabel.classList.toggle("active", hasOmdb);
  tmdbLabel.classList.toggle("active", hasTmdb);
}

async function restore() {
  const stored = await chrome.storage.local.get([SETTINGS_KEY, CREDENTIALS_KEY]);
  const settings = { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] ?? {}) };
  const credentials = stored[CREDENTIALS_KEY] ?? {};
  const visibility = readRatingVisibility(settings);
  openInNewTab.checked = settings.openInNewTab !== false;
  showRatings.checked = settings.showRatings !== false;
  for (const key of RATING_KEYS) ratingSwitches[key].checked = visibility[key];
  updateRatingVisibilityStatus();
  cacheHours.value = String([6, 24, 72].includes(Number(settings.cacheHours)) ? settings.cacheHours : 24);
  omdbKey.value = String(credentials.omdbApiKey ?? "");
  tmdbCredential.value = String(credentials.tmdbCredential ?? "");
  await refreshPermissionLabels();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("正在保存并检查 API 权限…");

  const omdbValue = omdbKey.value.trim();
  const tmdbValue = tmdbCredential.value.trim();
  const requestedOrigins = [];
  if (omdbValue) requestedOrigins.push("https://www.omdbapi.com/*");
  if (tmdbValue) requestedOrigins.push("https://api.themoviedb.org/*");

  const permissionGranted = await requestPermissions(requestedOrigins);
  if (!permissionGranted) {
    setStatus("未获得 API 站点权限。基础双向跳转仍可使用；可稍后再次保存以授权。", "error");
  }

  await chrome.storage.local.set({
    [SETTINGS_KEY]: {
      openInNewTab: openInNewTab.checked,
      showRatings: showRatings.checked,
      ratingVisibility: Object.fromEntries(RATING_KEYS.map((key) => [key, ratingSwitches[key].checked])),
      cacheHours: Number(cacheHours.value)
    }
  });

  await persistCredentials(omdbValue, tmdbValue);

  await refreshPermissionLabels();
  if (permissionGranted) {
    setStatus("设置已保存。重新进入或切换到下一部电影时生效。", "success");
  }
});

for (const button of document.querySelectorAll("[data-reveal]")) {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.reveal);
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.textContent = reveal ? "隐藏" : "显示";
  });
}

for (const button of document.querySelectorAll("[data-clear-credential]")) {
  button.addEventListener("click", async () => {
    const input = document.getElementById(button.dataset.clearCredential);
    if (!input) return;
    input.value = "";
    input.focus();
    setStatus("正在移除本地凭据和对应权限…");
    try {
      const permissionRemoved = await removeStoredCredential(
        button.dataset.clearKey,
        button.dataset.clearOrigin
      );
      await refreshPermissionLabels();
      setStatus(
        permissionRemoved
          ? "凭据已删除。若要同时保存其他修改，请继续点击“保存设置”。"
          : "凭据已从本地删除，但浏览器仍保留对应权限；可在扩展详情中手动撤销。",
        permissionRemoved ? "success" : "error"
      );
    } catch {
      setStatus("凭据删除失败，请点击“保存设置”后重试。", "error");
    }
  });
}

for (const input of Object.values(ratingSwitches)) {
  input.addEventListener("change", updateRatingVisibilityStatus);
}

document.getElementById("enable-all-ratings").addEventListener("click", () => {
  setAllRatingVisibility(true);
});

document.getElementById("disable-all-ratings").addEventListener("click", () => {
  setAllRatingVisibility(false);
});

document.getElementById("clear-cache").addEventListener("click", () => {
  setStatus("正在清空缓存…");
  chrome.runtime.sendMessage({ type: "FILM_BRIDGE_CLEAR_CACHE" }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      setStatus("缓存未能清空，请稍后再试。", "error");
      return;
    }
    setStatus(`已清空 ${response.count} 条匹配与评分缓存。`, "success");
  });
});

restore().catch(() => setStatus("设置读取失败，请重新打开此页面。", "error"));
