// Optional visual check using GitHub's Markdown renderer and the public repository's own CSS.
// Usage: node tools/verify-readme.mjs [path-to-playwright]
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || "playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendered = execFileSync("gh", [
  "api", "markdown", "-f", "mode=gfm", "-f", "context=niall133/film-bridge", "-F", "text=@README.md"
], { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 });
assert.match(rendered, /<h1[^>]*align="center"/);
assert.match(rendered, /readme-mark\.png/);
assert.equal((rendered.match(/<details>/g) || []).length, 7);
const icon = await readFile(path.join(root, "icons/readme-mark.png"));
const browser = await chromium.launch({ headless: true,
  ...(process.env.FILM_BRIDGE_CHROME_PATH ? { executablePath: process.env.FILM_BRIDGE_CHROME_PATH } : {})
});
const output = path.join(root, "dist/readme-preview");
await mkdir(output, { recursive: true });

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 980 });
  await page.goto("https://github.com/niall133/film-bridge", { waitUntil: "domcontentloaded" });
  const article = page.locator("article.markdown-body").first();
  await article.waitFor();
  assert.match(await article.textContent(), /Film Bridge/);
  await article.evaluate((node, html) => { node.innerHTML = html; }, rendered);
  const mark = article.locator('img[alt^="Film Bridge"]');
  await mark.evaluate((node, base64) => { node.src = `data:image/png;base64,${base64}`; }, icon.toString("base64"));
  await mark.evaluate((node) => node.decode());
  assert.equal(await mark.getAttribute("width"), "104");
  assert.equal(await article.locator('h1[align="center"]').count(), 1);
  for (const anchor of ["installation", "settings", "api-setup", "faq"]) {
    assert.equal(await article.locator(`#user-content-${anchor}, #${anchor}`).count(), 1);
  }
  const headerGeometry = await article.evaluate((node) => {
    const heading = node.querySelector("h1");
    const image = node.querySelector('img[alt^="Film Bridge"]');
    return {
      textAlign: getComputedStyle(heading).textAlign,
      article: node.getBoundingClientRect().toJSON(),
      image: image.getBoundingClientRect().toJSON()
    };
  });
  assert.equal(headerGeometry.textAlign, "center");
  assert.ok(Math.abs(headerGeometry.image.x + headerGeometry.image.width / 2
    - headerGeometry.article.x - headerGeometry.article.width / 2) < 2);
  // Put the entire brand area below GitHub's sticky README tabs before capturing it.
  await article.evaluate((node) => window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top - 110));
  await page.waitForTimeout(200);
  let bounds = await article.boundingBox();
  assert.ok((await mark.boundingBox()).y >= bounds.y, "Brand mark must not be clipped above the article");
  const desktopClip = {
    x: Math.max(0, bounds.x - 24), y: Math.max(0, bounds.y - 16),
    width: Math.min(1280 - Math.max(0, bounds.x - 24), bounds.width + 48),
    height: Math.min(900, bounds.height + 16)
  };
  await page.screenshot({ path: path.join(output, "desktop.png"), clip: {
    ...desktopClip
  } });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: path.join(output, "desktop-dark.png"), clip: {
    ...desktopClip
  } });
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 390, height: 900 });
  await article.evaluate((node) => window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top - 110));
  await page.waitForTimeout(200);
  bounds = await article.boundingBox();
  assert.ok(bounds.width <= 390);
  await page.screenshot({ path: path.join(output, "mobile.png"), clip: {
    x: Math.max(0, bounds.x - 16), y: Math.max(0, bounds.y - 16),
    width: Math.min(390 - Math.max(0, bounds.x - 16), bounds.width + 32), height: Math.min(900, bounds.height + 16)
  } });
  console.log(`README visual checks passed. GitHub-rendered previews: ${output}`);
} finally { await browser.close(); }
