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
  })
});
const RATING_DISPLAY_MODES = new Set(["both", "douban", "letterboxd"]);

const form = document.getElementById("settings-form");
const openInNewTab = document.getElementById("open-in-new-tab");
const showRatings = document.getElementById("show-ratings");
const doubanRatingDisplay = document.getElementById("douban-rating-display");
const letterboxdRatingDisplay = document.getElementById("letterboxd-rating-display");
const cacheHours = document.getElementById("cache-hours");
const omdbKey = document.getElementById("omdb-key");
const tmdbCredential = document.getElementById("tmdb-credential");
const status = document.getElementById("status");

function setStatus(message, tone = "") {
  status.textContent = message;
  status.className = tone;
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
    chrome.permissions.remove({ origins: [origin] }, resolve);
  });
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
  const ratingDisplay = settings.ratingDisplay && typeof settings.ratingDisplay === "object"
    ? settings.ratingDisplay
    : {};
  openInNewTab.checked = settings.openInNewTab !== false;
  showRatings.checked = settings.showRatings !== false;
  doubanRatingDisplay.value = RATING_DISPLAY_MODES.has(ratingDisplay.douban)
    ? ratingDisplay.douban
    : DEFAULT_SETTINGS.ratingDisplay.douban;
  letterboxdRatingDisplay.value = RATING_DISPLAY_MODES.has(ratingDisplay.letterboxd)
    ? ratingDisplay.letterboxd
    : DEFAULT_SETTINGS.ratingDisplay.letterboxd;
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
      ratingDisplay: {
        douban: doubanRatingDisplay.value,
        letterboxd: letterboxdRatingDisplay.value
      },
      cacheHours: Number(cacheHours.value)
    },
    [CREDENTIALS_KEY]: {
      omdbApiKey: omdbValue,
      tmdbCredential: tmdbValue
    }
  });

  if (!omdbValue && await containsPermission("https://www.omdbapi.com/*")) {
    await removePermission("https://www.omdbapi.com/*");
  }
  if (!tmdbValue && await containsPermission("https://api.themoviedb.org/*")) {
    await removePermission("https://api.themoviedb.org/*");
  }

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
