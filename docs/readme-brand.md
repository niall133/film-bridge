# README 展示资源

`icons/readme-mark.png` 是 README 专用高分辨率展示图，具有透明外侧和平滑的连续曲线方形轮廓。浏览器工具栏使用的 16 / 32 / 48 / 128px 图标未被替换；插件功能版本保持 v1.0.12。

生成方式：内置图像编辑工具，参考 `icons/icon-master.png`。该素材用于去掉旧图标的方形黑底，并保留电影票桥和五色节点的品牌识别。未使用普通 CSS `border-radius`，以便在 GitHub README 的受限 HTML 环境中同样显示轮廓。

## 最终编辑提示

```text
Use case: precise-object-edit / background-extraction. Asset type: high-resolution Film Bridge README brand icon on a genuinely transparent PNG canvas. Input image: edit target, the existing Film Bridge brand master. Preserve the existing cream movie-ticket bridge with exactly three arch cutouts, fine ticket perforations and the connecting cream arc with exactly five colored circular nodes in the same left-to-right order: teal green, orange, amber yellow at the top, cyan blue, leaf green. Keep their arrangement, proportions, subtle paper texture, central placement and recognizable identity unchanged. Change ONLY the dark tile's outer silhouette and its outside background: remove the solid black square outside the tile; use a perfectly balanced continuous-curvature squircle / superellipse silhouette, like a refined modern app icon (Lamé superellipse exponent about 3, smoothly curved shoulders, not an ordinary rectangle with circular corner radii). Dark near-black charcoal fill remains inside that silhouette. The entire space outside that continuous smooth silhouette MUST be genuinely transparent alpha, not black, not white and not a drawn checkerboard. Sharp clean anti-aliased outer edges with no halo or drop shadow outside. Single front-facing icon centered on a square 1024 x 1024 canvas, tiny even transparent safety padding. No extra symbols, text, watermarks, frame, glow, scene, or background. The five colored nodes and the entire cream bridge stay fully inside the dark silhouette.
```

实际返回文件为 1254 × 1254 像素，README 按 104px 显示；已检查角部 Alpha 为 0。生成尺寸以工具实际输出为准，轮廓为生成式近似，并非精确参数化几何。

可用 `tools/verify-readme.mjs` 调用 GitHub Markdown 渲染器并在公开仓库的实际样式下检查桌面、暗色与窄屏布局。输出位于已忽略的 `dist/readme-preview/`。这些预览只在独立的无界面浏览器中替换本地 DOM，不会修改 GitHub 页面数据。
