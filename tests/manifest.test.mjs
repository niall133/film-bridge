import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

test("manifest is a least-privilege MV3 extension with optional external rating hosts", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(new Set(manifest.host_permissions), new Set([
    "https://movie.douban.com/*",
    "https://letterboxd.com/*"
  ]));
  assert.deepEqual(new Set(manifest.optional_host_permissions), new Set([
    "https://www.omdbapi.com/*",
    "https://api.themoviedb.org/*"
  ]));
});

test("release version is synchronized across the extension and project metadata", async () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(packageJson.version, manifest.version);
  const options = await readFile(path.join(root, "src/options.html"), "utf8");
  const escapedVersion = manifest.version.replaceAll(".", "\\.");
  assert.match(options, new RegExp(`FILM BRIDGE \/ ${escapedVersion}`));
});

test("content script is present across all supported film detail sites", () => {
  const matches = manifest.content_scripts[0].matches;
  assert.ok(matches.includes("https://movie.douban.com/*"));
  assert.ok(matches.includes("https://letterboxd.com/*"));
  assert.ok(matches.includes("https://www.imdb.com/title/*"));
  assert.ok(matches.includes("https://imdb.com/title/*"));
  assert.ok(matches.includes("https://www.themoviedb.org/movie/*"));
  assert.ok(matches.includes("https://www.themoviedb.org/tv/*"));
  assert.ok(matches.includes("https://www.metacritic.com/movie/*"));
  assert.ok(matches.includes("https://metacritic.com/movie/*"));
  assert.equal(manifest.content_scripts[0].run_at, "document_idle");
});

test("every file referenced by the manifest exists", async () => {
  const referenced = new Set([
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...manifest.content_scripts.flatMap((entry) => [...(entry.js ?? []), ...(entry.css ?? [])]),
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon)
  ]);

  await Promise.all([...referenced].map((relativePath) => access(path.join(root, relativePath))));
  assert.ok(referenced.size >= 10);
});

test("extension JavaScript contains no remote scripts or dynamic code execution", async () => {
  const scripts = [
    "src/shared.js",
    "src/widget-styles.js",
    "src/content.js",
    "src/background.js",
    "src/options.js",
    "src/popup.js"
  ];
  const contents = await Promise.all(scripts.map((file) => readFile(path.join(root, file), "utf8")));
  for (const source of contents) {
    assert.doesNotMatch(source, /\beval\s*\(/);
    assert.doesNotMatch(source, /new\s+Function\s*\(/);
    assert.doesNotMatch(source, /<script[^>]+src=["']https?:/i);
  }
});
