import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("embedded widget stays compact and bounded to the film information column", async () => {
  const [styles, content, options, optionsScript] = await Promise.all([
    readFile(path.join(root, "src/widget-styles.js"), "utf8"),
    readFile(path.join(root, "src/content.js"), "utf8"),
    readFile(path.join(root, "src/options.html"), "utf8"),
    readFile(path.join(root, "src/options.js"), "utf8")
  ]);

  assert.match(styles, /width:\s*min\(100%,\s*720px\)/);
  assert.match(styles, /max-width:\s*720px/);
  assert.match(styles, /width:\s*fit-content/);
  assert.match(styles, /min-height:\s*78px/);
  assert.match(styles, /margin:\s*16px 0 32px/);
  assert.match(styles, /\.rating-name[\s\S]*font-size:\s*11px/);
  assert.doesNotMatch(styles, /min-height:\s*106px/);
  assert.doesNotMatch(styles, /min-width:\s*166px/);
  assert.match(content, /host\.style\.width\s*=\s*["']min\(100%, 720px\)["']/);
  assert.match(content, /host\.style\.maxWidth\s*=\s*["']720px["']/);
  assert.doesNotMatch(content, /FILM BRIDGE|CROSS-SITE SCORECARD|评分来源与设置/);
  assert.doesNotMatch(content, /class=\"status\"/);
  assert.match(content, /ratingVisibility/);
  assert.match(content, /extractMetacriticFilm/);
  assert.ok(content.includes('^\\/title\\/tt\\d{5,12}(?:\\/criticreviews)?'));
  assert.match(content, /dataset\.layout\s*=\s*["']imdb-critic["']/);
  assert.match(styles, /data-layout="imdb-critic"/);
  assert.match(content, /dataset\.current/);
  assert.match(content, /rating-arrow/);
  assert.match(content, /is-activating/);
  assert.doesNotMatch(content, /class=\"jump\"|data-jump|class=\"actions\"/);
  assert.doesNotMatch(styles, /\.jump|\.actions/);
  assert.match(options, /id="rating-visibility-controls"/);
  assert.match(options, /id="enable-all-ratings"/);
  assert.match(options, /id="disable-all-ratings"/);
  assert.match(options, /id="show-douban-rating"/);
  assert.match(options, /id="show-letterboxd-rating"/);
  assert.match(options, /id="show-imdb-rating"/);
  assert.match(options, /id="show-tmdb-rating"/);
  assert.match(options, /id="show-metacritic-rating"/);
  assert.match(options, /data-all-off/);
  assert.match(styles, /score-band/);
  assert.match(optionsScript, /storage\.local\.remove\(CREDENTIALS_KEY\)/);
  assert.match(optionsScript, /data-clear-credential/);
});
