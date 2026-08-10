import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("embedded widget stays compact and bounded to the film information column", async () => {
  const [styles, content, options] = await Promise.all([
    readFile(path.join(root, "src/widget-styles.js"), "utf8"),
    readFile(path.join(root, "src/content.js"), "utf8"),
    readFile(path.join(root, "src/options.html"), "utf8")
  ]);

  assert.match(styles, /width:\s*min\(100%,\s*720px\)/);
  assert.match(styles, /max-width:\s*720px/);
  assert.match(styles, /width:\s*fit-content/);
  assert.match(styles, /min-height:\s*78px/);
  assert.match(styles, /margin:\s*16px 0 32px/);
  assert.match(styles, /\.rating-name[\s\S]*font-size:\s*10px/);
  assert.doesNotMatch(styles, /min-height:\s*106px/);
  assert.doesNotMatch(styles, /min-width:\s*166px/);
  assert.match(content, /host\.style\.width\s*=\s*["']min\(100%, 720px\)["']/);
  assert.match(content, /host\.style\.maxWidth\s*=\s*["']720px["']/);
  assert.doesNotMatch(content, /FILM BRIDGE|CROSS-SITE SCORECARD|评分来源与设置/);
  assert.doesNotMatch(content, /class=\"status\"/);
  assert.match(content, /ratingDisplay/);
  assert.match(options, /id="douban-rating-display"/);
  assert.match(options, /id="letterboxd-rating-display"/);
  assert.match(options, /value="both"/);
  assert.match(options, /value="douban"/);
  assert.match(options, /value="letterboxd"/);
});
