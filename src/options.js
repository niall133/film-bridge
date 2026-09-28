"use strict";

const Shared = globalThis.FilmBridgeShared;
const SETTINGS_KEY = Shared.SETTINGS_KEY;
const CREDENTIALS_KEY = "filmBridge.credentials.v1";
const RATING_KEYS = Shared.RATING_KEYS;

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
let displaySaveQueue = Promise.resolve();
let displaySaveRevision = 0;
let pendingDisplaySaves = 0;

function setStatus(message, tone = "") {
  status.textContent = message;
  status.className = tone;
}

function updateRatingVisibilityStatus() {
  const values = RATING_KEYS.map((key) => Boolean(ratingSwitches[key]?.checked));
  const enabled = values.filter(Boolean).length;
  const allOff = enabled === 0;
  const allOn = enabled === RATING_KEYS.length;
  ratingVisibilityControls.dataset.allOff = String(allOff);
  ratingVisibilityStatus.textContent = allOff
    ? "全部来源已关闭，页面评分条已收起"
    : allOn ? "5 个评分来源均已开启" : `已开启 ${enabled} / ${RATING_KEYS.length} 个评分来源`;
}

function renderRatingControls(settings) {
  showRatings.checked = settings.showRatings;
  for (const key of RATING_KEYS) {
    ratingSwitches[key].checked = settings.ratingVisibility[key];
  }
  updateRatingVisibilityStatus();
}

function changeRatingControls(action) {
  const settings = Shared.changeRatingControls({
    showRatings: showRatings.checked,
    ratingVisibility: Object.fromEntries(RATING_KEYS.map((key) => [key, ratingSwitches[key].checked]))
  }, action);
  renderRatingControls(settings);
  const revision = ++displaySaveRevision;
  pendingDisplaySaves += 1;
  setStatus("正在保存显示设置…");
  // Serialize snapshots so fast repeated clicks always leave the last choice saved.
  displaySaveQueue = displaySaveQueue.catch(() => {}).then(async () => {
    // Drop superseded clicks before writing, rather than starting a request for every click.
    if (revision !== displaySaveRevision) return;
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    if (revision !== displaySaveRevision) return;
    await chrome.storage.local.set({
      [SETTINGS_KEY]: Shared.normalizeSettings({
        ...Shared.normalizeSettings(stored[SETTINGS_KEY]),
        showRatings: settings.showRatings,
        ratingVisibility: settings.ratingVisibility
      })
    });
    if (revision === displaySaveRevision) setStatus("显示设置已保存，已打开的电影页已同步。", "success");
  }).catch(() => {
    if (revision === displaySaveRevision) setStatus("显示设置保存失败，请点击“保存设置”重试。", "error");
  }).finally(() => {
    pendingDisplaySaves -= 1;
  });
}

// Keep multiple open settings tabs consistent without overwriting unsaved API fields.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SETTINGS_KEY] && pendingDisplaySaves === 0) {
    renderRatingControls(Shared.normalizeSettings(changes[SETTINGS_KEY].newValue));
  }
});

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
  const settings = Shared.normalizeSettings(stored[SETTINGS_KEY]);
  const credentials = stored[CREDENTIALS_KEY] ?? {};
  openInNewTab.checked = settings.openInNewTab !== false;
  renderRatingControls(settings);
  cacheHours.value = String([6, 24, 72].includes(Number(settings.cacheHours)) ? settings.cacheHours : 24);
  omdbKey.value = String(credentials.omdbApiKey ?? "");
  tmdbCredential.value = String(credentials.tmdbCredential ?? "");
  await refreshPermissionLabels();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveButton = form.querySelector('[type="submit"]');
  if (saveButton.disabled) return;
  saveButton.disabled = true;
  try {
    setStatus("正在保存并检查 API 权限…");

    const omdbValue = omdbKey.value.trim();
    const tmdbValue = tmdbCredential.value.trim();
    const requestedOrigins = [];
    if (omdbValue) requestedOrigins.push("https://www.omdbapi.com/*");
    if (tmdbValue) requestedOrigins.push("https://api.themoviedb.org/*");

    const permissionGranted = await requestPermissions(requestedOrigins);
    await displaySaveQueue;
    if (!permissionGranted) {
      setStatus("未获得 API 站点权限。基础双向跳转仍可使用；可稍后再次保存以授权。", "error");
    }

    await chrome.storage.local.set({
      [SETTINGS_KEY]: Shared.normalizeSettings({
        openInNewTab: openInNewTab.checked,
        showRatings: showRatings.checked,
        ratingVisibility: Object.fromEntries(RATING_KEYS.map((key) => [key, ratingSwitches[key].checked])),
        cacheHours: Number(cacheHours.value)
      })
    });

    await persistCredentials(omdbValue, tmdbValue);

    await refreshPermissionLabels();
    if (permissionGranted) {
      setStatus("设置已保存，已打开的电影页已同步。", "success");
    }
  } catch {
    setStatus("设置保存失败，请检查扩展是否已重新加载，并重试；API 凭据请勿公开。", "error");
  } finally {
    saveButton.disabled = false;
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
  input.addEventListener("change", () => {
    changeRatingControls({ type: "source", key: input.dataset.ratingSwitch, enabled: input.checked });
  });
}

showRatings.addEventListener("change", () => {
  changeRatingControls({ type: "master", enabled: showRatings.checked });
});

document.getElementById("enable-all-ratings").addEventListener("click", () => {
  changeRatingControls({ type: "all", enabled: true });
});

document.getElementById("disable-all-ratings").addEventListener("click", () => {
  changeRatingControls({ type: "all", enabled: false });
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

const displayControls = [
  showRatings,
  ...Object.values(ratingSwitches),
  document.getElementById("enable-all-ratings"),
  document.getElementById("disable-all-ratings")
];
for (const control of displayControls) control.disabled = true;
restore().catch(() => setStatus("设置读取失败，请重新打开此页面。", "error")).finally(() => {
  for (const control of displayControls) control.disabled = false;
});
