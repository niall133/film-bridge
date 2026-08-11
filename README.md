# Film Bridge · 影评桥

影评桥（Film Bridge）是一个无需构建的 Chrome / Edge Manifest V3 扩展：在豆瓣、Letterboxd、IMDb（包括 Critic Reviews 子页）、TMDB 或 Metacritic 的电影页面中，直接嵌入一张轻量评分卡，查看跨站评分并一键打开对应页面。

项目完全在浏览器本地运行，不需要开发者服务器、账号系统或构建工具。核心功能不依赖任何 API Key；OMDb 和 TMDB 只是可选的扩展评分来源。

![Manifest V3](https://img.shields.io/badge/Manifest-V3-087B50)
![Version](https://img.shields.io/badge/version-1.0.9-2f6f8f)
![License](https://img.shields.io/badge/license-MIT-111111)

## 现在已经支持

- 首次进入支持的电影页面即自动插入评分卡；扩展安装或更新时已经打开的旧标签页只需刷新一次。
- 五个页面来源均支持内嵌评分卡：豆瓣、Letterboxd、IMDb（包括 `/criticreviews/`）、TMDB 和 Metacritic。
- Metacritic 页面直接读取当前页 Metascore 与评论数；IMDb Critic Reviews 页面保留电影标题区域的整齐右侧布局。
- 监听 URL 与 DOM 变化，兼容站内无刷新导航；离开电影页时自动移除组件。
- 豆瓣 → Letterboxd：优先使用 IMDb ID 精准跳转；没有可用外部 ID 时使用片名与年份搜索。
- Letterboxd → 豆瓣：用片名（包括英文副标题）搜索候选，并用年份、标题相似度与候选差距做置信判断；不确定时宁可打开搜索结果，也不会武断地跳到同名电影。
- 直接显示当前页面上的豆瓣或 Letterboxd 用户评分。
- 尽力补全另一站评分；豆瓣页面中观察到的条目、ID 与评分会保存在本地，之后访问相应 Letterboxd 页面可直接复用。
- 设置页提供豆瓣、Letterboxd、IMDb、TMDB、Metascore 五个独立开关，默认全部开启，并支持“全部打开 / 全部关闭”；全部关闭时会以黄色状态提醒。
- 评分卡中的 IMDb、TMDB 与 Metascore 评分可点击跳转对应站点；Metascore 使用 Metacritic 风格的绿 / 黄 / 红色分级色块，并统一使用 IMDb ID 的 Critic Reviews 入口，避免本地化片名导致 slug 误判。
- 设置页提供 OMDb / TMDB 凭据的直接清除按钮；清除后会删除本地凭据并尝试撤销对应的可选权限。
- 可选接入 OMDb（IMDb + Metacritic）与 TMDB 评分；不填 API 凭据不影响核心双向跳转。
- 未上映或暂无评分时显示“—”，不会错误地显示为 0 分。
- 浅色豆瓣页面与深色 Letterboxd 页面分别适配的评分摘要 UI。
- Shadow DOM 样式隔离、键盘焦点样式、响应式布局和减少动态效果偏好。

## 典型使用场景

- 在豆瓣看完一部电影，想快速打开 Letterboxd 的影评、日志或评分分布。
- 在 Letterboxd 发现电影，想回到豆瓣查看中文资料、短评和本地评分。
- 只想在豆瓣页面看 Letterboxd 评分，或只想在 Letterboxd 页面看豆瓣评分。
- 需要同时参考 IMDb、TMDB 或 Metacritic 的公开评分。

## 安装

1. 在 Chrome 地址栏打开 `chrome://extensions`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择解压后的项目根目录（其中应直接包含 `manifest.json`）。
5. 此后新进入任一支持的电影页面，评分卡会自动出现。

Chrome 不会把刚安装的内容脚本追溯注入到安装前就已经打开的页面。因此，只有“安装扩展时已经停留在电影页”这一种情况需要刷新一次；安装完成后首次点击进入的新电影页不需要刷新。

可用于检查的页面：

- 豆瓣：<https://movie.douban.com/subject/3541415/>
- Letterboxd：<https://letterboxd.com/film/inception/>
- IMDb：<https://www.imdb.com/title/tt1375666/>
- IMDb Critic Reviews：<https://www.imdb.com/title/tt33764258/criticreviews/>
- TMDB：<https://www.themoviedb.org/movie/27205-inception>
- Metacritic：<https://www.metacritic.com/movie/leviticus/>

支持 Chrome、Edge、Brave 等 Chromium 浏览器。扩展更新后，在扩展管理页点击“重新加载”；已经打开的旧标签页通常需要刷新一次，之后站内无刷新切换电影不需要再次刷新。

## 页面内评分卡

评分卡只保留两类核心操作：

1. 查看当前页面与其他来源的评分。
2. 点击可跳转的评分卡打开 IMDb、TMDB、豆瓣、Letterboxd 或 Critic Reviews 页面；悬停、聚焦和点击时会显示箭头反馈。

当前所在网站的评分卡保持静态，不会跳转；它会在初次出现时用轻微的边框脉冲提示“这是当前页面评分”。其他可跳转评分卡在悬停、聚焦和点击时显示箭头反馈。

卡片会根据所在站点自动切换浅色或深色配色，并在窄屏下改为纵向布局。评分来源、匹配过程和 API 设置不占用页面内容区，统一放在扩展选项页中。

## 可选评分设置

点击 Chrome 工具栏里的扩展图标，再进入“评分来源与设置”；也可以在 `chrome://extensions` 的扩展详情中打开选项页。设置页用五个独立开关控制豆瓣、Letterboxd、IMDb、TMDB 与 Metascore 是否显示，并提供一键全开 / 全关。页面内的评分条只保留评分和跨站跳转，不再放置设置入口。

### OMDb

填写 [OMDb API Key](https://www.omdbapi.com/apikey.aspx) 后，可以显示：

- IMDb 用户评分（10 分制）
- Metacritic Metascore（100 分制）

Metascore 评分卡统一按 IMDb ID 生成 Critic Reviews 地址，例如 `tt33764258` → `https://www.imdb.com/title/tt33764258/criticreviews/`，评分数据本身仍来自 OMDb。

### TMDB

填写 [TMDB Read Access Token 或 API Key](https://www.themoviedb.org/settings/api) 后，可以显示 TMDB 用户评分（10 分制）。推荐使用 Read Access Token。

API 凭据保存在 `chrome.storage.local`，不会同步到云端，也不会写入电影网站。扩展只在用户保存非空凭据时请求相应 API 域名的可选权限；清空凭据会同时移除权限。

## 匹配与评分策略

| 当前页面 | 目标站匹配 | 评分读取 |
|---|---|---|
| 豆瓣 | IMDb `/imdb/{id}/` → 片名与年份搜索 | 当前豆瓣 DOM；Letterboxd 主页面 JSON-LD |
| Letterboxd | 本地观察缓存 → 豆瓣标题建议 + 年份/相似度 → 搜索 | 当前 Letterboxd JSON-LD；本地豆瓣观察缓存；豆瓣详情页仅尽力抓取 |
| IMDb | 豆瓣标题建议 + 年份/IMDb 校验；同时尽力读取 Letterboxd | 当前 IMDb JSON-LD / 页面评分；OMDb 可补全 IMDb 与 Metascore |
| TMDB | 豆瓣标题建议 + 年份；TMDB ID 可用于 Letterboxd 路由 | 当前 TMDB JSON-LD / 页面评分；TMDB API 可补全用户评分 |
| Metacritic | 豆瓣标题建议 + 年份；可用 IMDb ID 时继续校验 | 当前页 Metascore 与评论数；再由 OMDb / TMDB 补全其他评分 |

豆瓣详情页对扩展后台请求可能触发安全验证，所以“另一站的豆瓣实时评分”不能在纯本地扩展里保证每次都拿到。这个限制不会影响跳转：扩展会优先利用用户正常浏览豆瓣页面时读取并缓存的评分；没有可信评分时保持空值。Letterboxd 则只请求电影主页面，不使用容易触发 Cloudflare 验证的延迟评分接口。

评分与匹配默认缓存 24 小时，可在设置中改为 6 小时或 3 天。映射失败或 API 暂时不可用时，目标评分卡仍保持可点击的安全回退地址。

## 权限说明

- `storage`：保存设置、API 凭据、匹配结果和用户已访问页面中公开可见的评分。
- `movie.douban.com`：在豆瓣页面插入组件，并由后台请求电影建议。
- `letterboxd.com`：在 Letterboxd 页面插入组件，并由后台解析主页面公开 JSON-LD。
- `imdb.com`、`themoviedb.org`：仅用于在对应详情页内嵌评分卡并读取当前页面公开信息。
- `metacritic.com`：仅用于在电影详情页内嵌信息条并读取页面公开的 Metascore。
- `www.omdbapi.com`、`api.themoviedb.org`：可选权限，仅在设置对应凭据后请求。

没有 `tabs`、浏览历史、Cookie API 或全站网页权限，也没有远程托管代码。

为降低豆瓣建议端点返回“软空结果”的概率，后台建议请求会让浏览器按站点规则自然携带已有豆瓣会话；扩展本身没有 Cookie API 权限，不读取、记录或导出 Cookie 内容。

## 本地验证

项目没有运行时依赖。Node.js 20+ 可执行：

```powershell
npm run check
npm test
```

测试覆盖：Manifest 引用与权限、五个详情站点的匹配、IMDb Critic Reviews 子页面、Letterboxd CDATA JSON-LD、无效 IMDb 200 页面、未上映空评分、豆瓣 DOM 评分优先级、非电影候选过滤、同名歧义回退、Metascore URL、TMDB 两种凭据格式。

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

## 常见问题

### 为什么评分卡出现了，但另一站评分是“—”？

跳转和评分是两条独立链路。目标站点可能触发安全验证、限流或暂时没有公开评分；这时扩展仍会保留可用的搜索或详情页入口，不会把缺失评分当成 0 分。

### 为什么同名电影没有自动直达？

当 IMDb / TMDB ID 不足，且片名与年份无法唯一确认时，扩展会打开目标站搜索页，避免把同名电影误认为同一部影片。

### API Key 会上传到项目或网站吗？

不会。OMDb / TMDB 凭据只保存在当前浏览器的 `chrome.storage.local`，并只用于请求对应官方 API；设置页的“清除”按钮会直接删除本地凭据并撤销对应权限。项目没有开发者后端，也不会把凭据发送给豆瓣或 Letterboxd。

## 开发与贡献

项目没有构建步骤，源码修改后在 `chrome://extensions` 点击“重新加载”即可验证。

提交修改前请运行：

```powershell
npm run check
npm test
```

如果豆瓣或 Letterboxd 改变页面结构，欢迎提交 Issue，并附上脱敏后的页面结构、浏览器版本和扩展控制台错误；不要上传 Cookie、API Key 或私人观影记录。

## 当前版本

`v1.0.9`：统一项目品牌为“Film Bridge · 影评桥”，同步更新扩展名称、设置入口、项目文档和 GitHub 仓库名称。

`v1.0.8`：优化 IMDb `/criticreviews/` 页面信息条布局，在宽屏下靠右排列并在窄屏下自动恢复为上下布局。

`v1.0.7`：支持 IMDb `/criticreviews/` 页面注入信息条，并从子页面标题、IMDb ID 和页面评分信息中补全跨站评分入口。

`v1.0.6`：增加 Metacritic 电影详情页的信息条注入，读取当前页 Metascore、年份和评论数，并继续提供跨站评分入口。

## 免责声明

影评桥（Film Bridge）是独立的非官方工具，与豆瓣、Letterboxd、IMDb、TMDB、Metacritic、Google 或 Microsoft 不存在隶属、授权、赞助或背书关系。相关名称、商标和服务归各自权利人所有。使用者应自行遵守相关网站的服务条款与所在地区适用的法律法规。
