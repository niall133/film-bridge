# Film Bridge · 豆瓣 ↔ Letterboxd

一个无需构建的 Chrome Manifest V3 扩展。进入豆瓣或 Letterboxd 的电影详情页时，它会把同一块“电影票根”直接嵌在影片标题下方，提供双向跳转和跨站评分。

## 现在已经支持

- 首次进入电影页即自动插入，不需要为了看到入口再刷新页面。
- 监听 URL 与 DOM 变化，兼容站内无刷新导航；离开电影页时自动移除组件。
- 豆瓣 → Letterboxd：优先使用 IMDb ID 精准跳转；没有可用外部 ID 时使用片名与年份搜索。
- Letterboxd → 豆瓣：用片名（包括英文副标题）搜索候选，并用年份、标题相似度与候选差距做置信判断；不确定时宁可打开搜索结果，也不会武断地跳到同名电影。
- 直接显示当前页面上的豆瓣或 Letterboxd 用户评分。
- 尽力补全另一站评分；豆瓣页面中观察到的条目、ID 与评分会保存在本地，之后访问相应 Letterboxd 页面可直接复用。
- 可选接入 OMDb（IMDb + Metacritic）与 TMDB 评分；不填 API 凭据不影响核心双向跳转。
- 未上映或暂无评分时显示“—”，不会错误地显示为 0 分。
- Shadow DOM 样式隔离、键盘焦点样式、响应式布局和减少动态效果偏好。

## 安装

1. 在 Chrome 地址栏打开 `chrome://extensions`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择解压后的项目根目录（其中应直接包含 `manifest.json`）。
5. 此后新进入任一电影详情页，入口会自动出现。

Chrome 不会把刚安装的内容脚本追溯注入到安装前就已经打开的页面。因此，只有“安装扩展时已经停留在电影页”这一种情况需要刷新一次；安装完成后首次点击进入的新电影页不需要刷新。

可用于检查的页面：

- 豆瓣：<https://movie.douban.com/subject/3541415/>
- Letterboxd：<https://letterboxd.com/film/inception/>

## 可选评分设置

点击 Chrome 工具栏里的扩展图标，再进入“评分来源与设置”；也可以在 `chrome://extensions` 的扩展详情中打开选项页。设置页可以分别选择豆瓣页面和 Letterboxd 页面显示“豆瓣 + Letterboxd”“仅豆瓣”或“仅 Letterboxd”。页面内的评分条只保留评分和跨站跳转，不再放置设置入口。

### OMDb

填写 [OMDb API Key](https://www.omdbapi.com/apikey.aspx) 后，可以显示：

- IMDb 用户评分（10 分制）
- Metacritic Metascore（100 分制）

### TMDB

填写 [TMDB Read Access Token 或 API Key](https://www.themoviedb.org/settings/api) 后，可以显示 TMDB 用户评分（10 分制）。推荐使用 Read Access Token。

API 凭据保存在 `chrome.storage.local`，不会同步到云端，也不会写入电影网站。扩展只在用户保存非空凭据时请求相应 API 域名的可选权限；清空凭据会同时移除权限。

## 匹配与评分策略

| 当前页面 | 目标站匹配 | 评分读取 |
|---|---|---|
| 豆瓣 | IMDb `/imdb/{id}/` → 片名与年份搜索 | 当前豆瓣 DOM；Letterboxd 主页面 JSON-LD |
| Letterboxd | 本地观察缓存 → 豆瓣标题建议 + 年份/相似度 → 搜索 | 当前 Letterboxd JSON-LD；本地豆瓣观察缓存；豆瓣详情页仅尽力抓取 |

豆瓣详情页对扩展后台请求可能触发安全验证，所以“另一站的豆瓣实时评分”不能在纯本地扩展里保证每次都拿到。这个限制不会影响跳转：扩展会优先利用用户正常浏览豆瓣页面时读取并缓存的评分；没有可信评分时保持空值。Letterboxd 则只请求电影主页面，不使用容易触发 Cloudflare 验证的延迟评分接口。

评分与匹配默认缓存 24 小时，可在设置中改为 6 小时或 3 天。映射失败或 API 暂时不可用时，按钮仍保持可点击的安全回退地址。

## 权限说明

- `storage`：保存设置、API 凭据、匹配结果和用户已访问页面中公开可见的评分。
- `movie.douban.com`：在豆瓣页面插入组件，并由后台请求电影建议。
- `letterboxd.com`：在 Letterboxd 页面插入组件，并由后台解析主页面公开 JSON-LD。
- `www.omdbapi.com`、`api.themoviedb.org`：可选权限，仅在设置对应凭据后请求。

没有 `tabs`、浏览历史、Cookie API 或全站网页权限，也没有远程托管代码。

为降低豆瓣建议端点返回“软空结果”的概率，后台建议请求会让浏览器按站点规则自然携带已有豆瓣会话；扩展本身没有 Cookie API 权限，不读取、记录或导出 Cookie 内容。

## 本地验证

项目没有运行时依赖。Node.js 20+ 可执行：

```powershell
npm run check
npm test
```

测试覆盖：Manifest 引用与权限、Letterboxd CDATA JSON-LD、无效 IMDb 200 页面、未上映空评分、豆瓣 DOM 评分优先级、非电影候选过滤、同名歧义回退、TMDB 两种凭据格式。

重新生成图标：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\generate-icons.ps1
```

## 项目结构

```text
manifest.json
src/
  background.js       # 跨站解析、匹配、缓存与可选 API
  content.js          # 页面识别、即时内联挂载与无刷新导航监听
  shared.js           # 标题、ID、评分与 URL 的纯函数
  widget-styles.js    # Shadow DOM 票根样式
  options.*           # 设置页
  popup.*             # 工具栏说明与设置入口
tests/                # Node 内置测试运行器测试
icons/                # Chrome PNG 图标
tools/                # 图标生成脚本
```

## 数据源边界

本扩展解析的是网站公开页面结构，豆瓣和 Letterboxd 未记录在案的页面改版可能需要更新选择器。外部评分归各数据源所有；扩展只做即时展示，不批量采集、不上传浏览记录。

Chrome MV3 相关实现遵循官方的[跨域网络请求](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)、[Manifest 图标](https://developer.chrome.com/docs/extensions/reference/manifest/icons)和[设置页](https://developer.chrome.com/docs/extensions/develop/ui/options-page)规范。
