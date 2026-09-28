<p align="center">
  <img src="icons/readme-mark.png" width="104" height="104" alt="Film Bridge · 影评桥 — 五色节点与电影票桥">
</p>

<h1 align="center">Film Bridge · 影评桥</h1>

<p align="center">
  <strong>跨站电影评分，一眼看齐。</strong>
</p>

<p align="center">
  豆瓣 &nbsp;·&nbsp; Letterboxd &nbsp;·&nbsp; IMDb &nbsp;·&nbsp; TMDB &nbsp;·&nbsp; Metacritic
</p>

<p align="center">
  <a href="manifest.json"><img src="https://img.shields.io/badge/Chrome-MV3-0f766e?style=flat-square&amp;labelColor=263238" alt="Chrome Manifest V3"></a>
  <a href="https://github.com/niall133/film-bridge/releases/latest"><img src="https://img.shields.io/badge/version-1.0.12-0f766e?style=flat-square&amp;labelColor=263238" alt="Version 1.0.12"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0f766e?style=flat-square&amp;labelColor=263238" alt="MIT License"></a>
</p>

<p align="center">
  <a href="https://github.com/niall133/film-bridge/releases/latest"><strong>下载安装</strong></a> &nbsp;·&nbsp;
  <a href="#installation">安装指南</a> &nbsp;·&nbsp;
  <a href="#settings">设置说明</a> &nbsp;·&nbsp;
  <a href="#api-setup">API 申请</a> &nbsp;·&nbsp;
  <a href="#faq">常见问题</a>
</p>

---

## 快速了解

影评桥在受支持的电影详情页内嵌轻量评分卡，点击评分即可前往对应电影页面。无需侧栏、无需复制片名；无法确认唯一条目时回退到搜索结果。

| 即装即用 | 按需扩展 | 本地优先 |
|:---:|:---:|:---:|
| 基础功能无需密钥 | OMDb / TMDB 可选 | 设置与缓存保存在本机 |

> 来源默认全部开启，但开关不代表数据一定可用。未配置 API、站点限制或影片暂无评分时，不保证显示出五个分数。

[隐私政策](PRIVACY.md) · [反馈问题](https://github.com/niall133/film-bridge/issues) · [更新记录](CHANGELOG.md)

## 功能与支持页面

- **自动出现：** 首次进入详情页即嵌入，兼容站内无刷新导航，包含 IMDb Critic Reviews 子页。
- **跨站跳转：** 点击其他站评分打开对应电影；当前站不重复跳转，悬停、聚焦与点击提供轻微反馈。
- **适配页面：** 豆瓣浅色、Letterboxd 深色分别适配；IMDb Critic Reviews 宽屏靠右，窄屏自动堆叠。
- **来源可控：** 五个来源独立选择，总开关同步全开 / 全关；无可见卡片时完全收起，不留空框或间距。
- **尊重数据：** 当前页评分优先，缺失值显示“—”；Metascore 使用绿 / 黄 / 红色块，并优先跳转 IMDb ID 的 Critic Reviews 入口。
- **细节完善：** 可调整缓存、删除凭据；支持键盘操作及系统“减少动态效果”偏好。

| 网站 | 支持的页面 |
|---|---|
| 豆瓣电影 | `movie.douban.com/subject/电影ID/` |
| Letterboxd | `letterboxd.com/film/电影名称/` |
| IMDb | `imdb.com/title/tt序列号/`、`imdb.com/title/tt序列号/criticreviews/` |
| TMDB | `themoviedb.org/movie/条目ID`，也兼容 `/tv/` 详情页 |
| Metacritic | `metacritic.com/movie/电影名称/` |

评分开关控制的是**影评桥插入的评分卡**，不会删除或修改网站原本的评分模块，也不会修改用户在网站上的打分。

<a id="installation"></a>

## 安装与更新

### 从 GitHub Release 安装

1. 打开 [最新 Release](https://github.com/niall133/film-bridge/releases/latest)。
2. 在 **Assets** 中下载 `film-bridge-v版本号.zip`。不是 `Source code (zip)`，也不是直接把 ZIP 拖入浏览器。
3. 将 ZIP 完整解压到一个固定文件夹。不要安装后删除或移动该文件夹。
4. Chrome 地址栏输入 `chrome://extensions`，打开右上角“开发者模式”。
5. 点击“加载已解压的扩展程序”，选择**直接包含 `manifest.json` 的文件夹**。
6. 新进入支持的电影详情页，评分卡会自动出现。

Edge 使用 `edge://extensions`；Brave 等 Chromium 浏览器也可按相同方式加载。不要选择 ZIP 文件本身或它的上一级空文件夹。

源码同样可以直接加载：解压仓库源码后，选择包含 `manifest.json` 的仓库根目录即可。

### 更新已有的本地扩展

为保留设置和 API 凭据，建议继续使用原来的加载目录：

1. 下载新版本 ZIP，解压到临时文件夹。
2. 将新版本文件复制到**原扩展文件夹**，替换旧的程序文件。
3. 在扩展管理页点击影评桥的“重新加载”，确认版本号已更新。
4. 安装 / 更新前已经打开的电影标签页，刷新一次。

重新加载扩展不会自动把旧页面上的脚本换成新版本；之后正常点击进入的新电影页不需要再次刷新。不要直接卸载再安装来更新：卸载会删除该扩展的本地设置；改变加载目录也可能改变扩展身份。

可以用《盗梦空间》检查：

[豆瓣](https://movie.douban.com/subject/3541415/) · [Letterboxd](https://letterboxd.com/film/inception/) · [IMDb](https://www.imdb.com/title/tt1375666/) · [Critic Reviews](https://www.imdb.com/title/tt1375666/criticreviews/) · [TMDB](https://www.themoviedb.org/movie/27205-inception)

<a id="settings"></a>

## 设置详解

点击浏览器工具栏的影评桥图标 → **评分来源与设置**。找不到图标时，先点击工具栏的拼图图标；也可从扩展管理页的详情中打开“扩展程序选项”。

### 1. 显示评分卡与五个来源

从 v1.0.12 起，总开关不再存在“关闭了评分卡但来源仍开启”的暂停状态。规则只有一个：**至少一个来源开启，总开关就开启；全部来源关闭，总开关就关闭。**

| 操作 | 总开关 | 五个来源 | 页面结果 |
|---|---|---|---|
| 关闭“显示评分卡” | 关闭 | 全部关闭 | 整条评分卡和占位间距收起 |
| 开启“显示评分卡” | 开启 | 全部打开 | 按数据可用性显示评分卡 |
| 点击“全部关闭” | 关闭 | 全部关闭 | 与关闭总开关相同 |
| 点击“全部打开” | 开启 | 全部打开 | 与开启总开关相同 |
| 单独开启一个来源 | 自动开启 | 只开启该来源，不改其他来源 | 显示该来源的可用评分卡 |
| 关闭一个来源，但仍有其他来源开启 | 保持开启 | 只关闭该来源 | 保留其他评分卡 |
| 关闭最后一个来源 | 自动关闭 | 全部关闭 | 整条评分卡收起 |

全部关闭时，五个来源开关区域会显示黄色，提示“没有选择任何来源”；**黄色不是报错**。开启任一来源后黄色提示消失。

总开关重新开启会打开全部五个来源，**不会恢复之前的部分选择**。如果只想保留一个来源，请在全部关闭后单独打开它。

旧版“总开关关闭、部分来源开启”的设置会按新规则视为全部关闭，避免升级后突然显示评分卡。

这些显示开关会**自动保存并同步到已打开的电影页**，无需再点击“保存设置”。同时打开多个设置页时，来源状态也会同步。快速连续点击以最后一次选择为准；迟到的评分请求不会把已关闭的卡片重新打开。

### 2. 各来源需要什么

| 来源开关 | 评分制式 | 不配 API 时 | 跨站补全方式 |
|---|---|---|---|
| 豆瓣评分 | 用户平均分 / 10 | 当前豆瓣页可直接读取 | 本地已浏览条目缓存、候选匹配及公开详情页，受安全验证影响 |
| Letterboxd 评分 | 用户平均分 / 5 | 当前页可读取，其他站尽力解析公开主页面 | IMDb / TMDB ID、标题搜索及本地缓存 |
| IMDb 评分 | 用户平均分 / 10 | 当前 IMDb 页可直接读取 | OMDb API Key |
| TMDB 评分 | 用户平均分 / 10 | 当前 TMDB 页可直接读取 | TMDB Read Access Token 或 API Key |
| Metascore | Metacritic 专家分 / 100 | 当前 Metacritic 电影页可直接读取 | OMDb API Key，与 IMDb 来源共用同一 Key |

开关选项是全局设置，适用于全部支持页面；没有针对不同网站保存不同组合。

例如只想看 Letterboxd：点“全部关闭” → 只打开“Letterboxd 评分”。在豆瓣和其他支持页面中，影评桥就只保留这个来源。它不会隐藏豆瓣网页自身的豆瓣评分。

外部来源未配置 API 且没有可读评分时会隐藏；如果所有已选来源都没有可显示的卡片，整个评分条也会收起。有凭据但数据不可用时可能显示“—”，不代表 0 分。

### 3. 在新标签页打开

默认开启：点击评分后保留当前电影页，在新标签页打开目标站。关闭后在当前标签页跳转。

此选项需要点击“保存设置”。当前网站的评分卡不会跳转，无论此开关如何设置。

### 4. 评分缓存

默认 **24 小时**，也可选择 **6 小时**或 **3 天**。更短的时长有利于更新评分，但可能产生更多站点 / API 请求；更长的时长更节省请求。

更改时长后点击“保存设置”。“清空评分缓存”会立即删除本地匹配与评分缓存，不删除 API 凭据和显示设置；需要立即重新取数时，再刷新电影页或进入下一部电影。

显示开关只控制显示与加载，不会删除 API 凭据或已有缓存。全部关闭后不发起新的评分补全请求；关闭之前已经发出的请求可能仍会结束，但不能重新显示卡片。

### 5. 哪些操作要保存

- **自动保存：** 总开关、五个来源开关、“全部打开 / 全部关闭”。
- **点击后立即执行：** 凭据旁的“清除”、“清空评分缓存”。
- **需要点击“保存设置”：** 新标签页选项、缓存时长、填写 / 替换 API 凭据、手动清空凭据输入框。

来源开关自动保存不会顺带保存尚未提交的 Key 或其他选项。

<a id="api-setup"></a>

## API 申请与配置：一步一步

API 是可选的。想在其他网站上稳定补全 IMDb / Metascore，就申请 **OMDb**；想补全 TMDB，就申请 **TMDB**。两者不是同一个服务，Key 不能混用，也不需要申请付费 IMDb 产品的密钥。扩展不提供共用密钥；凭据由用户自行申请。

下面的申请入口与凭据类型按官方说明整理；网站表单可能调整，字段与套餐以实际申请页为准。不要向本项目提交账号密码、真实 Key 或 Token。

### A. OMDb：IMDb 用户分 + Metascore

#### 申请自己的 Key

1. 用常用邮箱打开 [OMDb API Key 申请页](https://www.omdbapi.com/apikey.aspx)。
2. 选择适合自己的套餐。目前官方页面提供 **FREE!（每日 1,000 次请求）**，也有 Patreon 方案；额度以申请页为准。
3. 按免费申请表填写邮箱及页面要求的姓名 / 用途等字段。用途可如实填写“在个人浏览器扩展中查看电影评分”，然后提交。
4. 查收 OMDb 发来的邮件，包括垃圾邮件文件夹。官方通过邮件分发 Key；如果邮件要求激活，先点击邮件中的激活链接，再使用 Key。
5. 复制 Key 本身，不要复制邮件中的完整请求网址、激活链接，也不要把 IMDb 的 `tt...` 电影序列号当作 Key。

官方申请页提示部分邮箱可能延迟；长时间未收到时，请使用页面提供的官方联系渠道处理，不要在 GitHub Issue 中公开邮箱或 Key。[OMDb 申请页](https://www.omdbapi.com/apikey.aspx)、[OMDb 官方说明](https://www.omdbapi.com/)。

#### 填入影评桥

1. 打开“评分来源与设置”，找到“更多评分”中的 **OMDb / API Key**。
2. 粘贴邮件中收到并按要求激活的 Key。需要核对时点“显示”，核对后点“隐藏”。
3. 点击“保存设置”。浏览器如弹出权限窗口，允许访问 `https://www.omdbapi.com/*`。
4. 确认“IMDb 评分”和 / 或“Metascore”来源已开启；无需两项同时开启。
5. 进入支持的电影页检查。已打开的页面会同步设置；若怀疑旧缓存，可清空评分缓存后刷新一次。

**“已授权”只说明浏览器允许访问 OMDb 域名，不会验证 Key 是否有效。** Key 未激活、拼写错误、配额耗尽、服务不可用、影片无 IMDb ID 或 OMDb 未收录，都可能导致没有分数。

Metascore 卡片使用电影的 IMDb ID 跳转，例如：

```text
tt33764258 → https://www.imdb.com/title/tt33764258/criticreviews/
```

这里是 IMDb 的 Metacritic 影评入口；评分数据仍是 Metacritic 专家分，不是 IMDb 用户分。IMDb 官方付费 API 凭据不能填入 OMDb 字段。

### B. TMDB：用户平均分

#### 创建账号与申请

1. 在桌面浏览器注册并登录 [TMDB](https://www.themoviedb.org/)。如网站要求，先完成邮箱验证。
2. 打开 [账户 API 设置](https://www.themoviedb.org/settings/api)，或从头像 / 账户设置中的“API”进入。
3. 尚未申请时，找到申请 / 创建 API Key 的入口，阅读并接受官方使用条款。个人非商业用途选择对应的开发者申请；商业用途需按 TMDB 官方要求处理。
4. 按当前表单真实填写应用与联系信息，不要编造资料。若表单要求应用名、网址和简介，可参考以下示例，按自己的实际用途调整：

   | 字段（若申请页要求） | 个人使用影评桥的填写示例 |
   |---|---|
   | Application Name | `Film Bridge - Personal Use` |
   | Application URL | `https://github.com/niall133/film-bridge`（说明使用的开源项目） |
   | Application Summary | `Personal use of the open-source Film Bridge browser extension to display TMDB movie ratings on movie detail pages. No redistribution or commercial use.` |
   | 联系信息等其他字段 | 申请者本人的真实信息，以表单要求为准 |

   这不是 TMDB 固定模板，也不保证获批；只有用途确实符合示例时才采用。公开仓库地址不意味着你是项目作者或已获得 TMDB 背书。

5. 提交后按页面提示完成申请。取得凭据后回到 API 设置页。
6. 找到 **API Read Access Token** 或 **API Key**。影评桥两种均支持，只需复制其中一种；推荐 Read Access Token。

TMDB 官方说明：API 申请在账户设置中进行，建议用桌面浏览器；非商业使用的免费条件与商业申请规则见官方 [Getting Started](https://developer.themoviedb.org/docs/getting-started) 和 [FAQ](https://developer.themoviedb.org/docs/faq)。

#### 填入影评桥

1. 找到“更多评分”中的 **TMDB / Read Access Token 或 API Key**。
2. 粘贴完整的 **Read Access Token**，不要自行添加 `Bearer ` 前缀、引号或换行。也可直接粘贴 API Key；不要同时填两种。
3. 不要使用账号密码、临时 Request Token 或 Session ID。这些不是此字段所需的应用凭据。
4. 点击“保存设置”，如浏览器询问，允许访问 `https://api.themoviedb.org/*`。
5. 打开“TMDB 评分”来源，再进入电影详情页检查。缺少可用 IMDb / TMDB ID、条目没有用户评分或 API 不可达时，仍可能显示“—”或隐藏。

官方说明 Read Access Token 和 API Key 均可用于应用认证：[TMDB Application Authentication](https://developer.themoviedb.org/docs/authentication-application)。扩展会自动处理认证，不需要用户编写请求代码。

### C. 替换、删除凭据与撤销授权

- **替换：** 输入新 Key / Token → 点击“保存设置”。新凭据仅在保存后生效。
- **立即删除：** 点击对应输入框旁的“清除”。本地凭据立即删除，同时尝试撤销该 API 域名的可选权限；不必再保存。
- **手动清空：** 删除输入框文字后点击“保存设置”，同样会删除本地凭据并尝试撤权。
- **只关闭评分来源：** 不会删除凭据或撤销权限，之后可直接重新开启。
- **权限没有撤销成功：** 根据设置页提示，在浏览器扩展详情中检查对应站点权限。
- **在 API 服务端注销 Key：** 请到 OMDb / TMDB 账户或官方渠道操作。扩展的“清除”只删除本机副本，不会注销远端凭据。

凭据存放在 `chrome.storage.local`，不会通过 Chrome Sync 同步，也不会写入电影网站页面。它不是密码保险库或端到端加密存储；请保护浏览器配置文件。凭据仅发送给对应 API 服务用于认证，不发送给项目开发者或其他电影网站。

<a id="faq"></a>

## 常见问题

<details>
<summary><strong>已打开来源，为什么没有看到对应评分？</strong></summary>

依次检查：

1. 总开关与该来源是否开启？只看某一来源时，不要再次点总开关开启，否则会恢复全部五个。
2. 是不是在支持的详情页，而不是搜索页、榜单或个人主页？
3. 外部评分是否已填写对应凭据、点击保存并允许 API 域名访问？
4. “已授权”不等于 Key 正确：OMDb 邮件激活、TMDB 凭据类型、配额与网络状态都需要检查。
5. 影片可能未上映、尚无人评分，或没有可用的外部 ID / 专家评论；缺失值不会变成 0。
6. 若设置或数据刚改过，清空评分缓存后刷新一次。

只选了未配置 API 且没有数据的来源时，整条评分卡可能不显示，这是隐藏不可用卡片后的正常结果；来源开关仍保留你的选择。

</details>

<details>
<summary><strong>全部关闭后，为什么网页仍有豆瓣 / IMDb 原生评分？</strong></summary>

开关只管理影评桥自己的评分卡，网站原有模块不在关闭范围内。全部关闭后，影评桥的彩色评分条、阴影和占位间距都会收起。

</details>

<details>
<summary><strong>为什么另一站的豆瓣评分是“—”，但能跳转？</strong></summary>

评分读取与页面跳转独立。豆瓣安全验证 / 限流可能阻止后台读取，扩展会尝试复用你正常浏览豆瓣条目时保存的本地数据；没有可信分数就保持空值。打开那部电影的豆瓣页面可帮助补充本地记录，但不能保证绕过站点限制。

</details>

<details>
<summary><strong>为什么有时打开搜索结果，而不是直接进入电影？</strong></summary>

片名和年份不能唯一确认同名电影时，扩展保留安全搜索入口。优先用 IMDb / TMDB ID 或可信本地记录匹配，不会只靠中文片名拼接第三方电影网址。

</details>

<details>
<summary><strong>为什么安装 / 更新后旧标签页没有变化？</strong></summary>

旧页面仍可能运行旧脚本。扩展管理页重新加载后刷新已有电影页一次；此后新进入的电影页会自动显示。若浏览器限制扩展站点访问，请在扩展详情中允许所支持的站点。

</details>

<details>
<summary><strong>不填 API 能做什么？</strong></summary>

豆瓣与 Letterboxd 的跨站入口仍可用；支持详情页上可读的当前站评分仍会显示。IMDb / TMDB / Metacritic 的当前页评分不需要为了读取本页再申请 API。跨站补全外部分数才主要依赖可选 API。

</details>

<details>
<summary><strong>如何提交问题？</strong></summary>

请到 [GitHub Issues](https://github.com/niall133/film-bridge/issues)，提供浏览器版本、扩展版本、公开电影网址、开关组合和脱敏截图。不要公开 Cookie、账号密码、API Key / Token 或含 Key 的完整请求网址。

</details>

## 匹配、数据与隐私边界

优先使用可信外部 ID 和本地已观察记录；缺少 ID 时，结合片名、年份、候选差距判断。豆瓣详情页的安全验证、Letterboxd 的访问限制与 API 配额可能使跨站评分暂时不可用。电影网站改版也可能需要更新解析规则。

| 权限 / 域名 | 用途 |
|---|---|
| `storage` | 保存显示设置、缓存、公开电影元数据及用户主动填写的凭据 |
| `movie.douban.com`、`letterboxd.com` | 插入组件及必要的跨站页面匹配 / 评分解析 |
| IMDb、TMDB、Metacritic 的限定详情页 | 注入组件，读取当前页面公开电影信息 |
| `www.omdbapi.com`、`api.themoviedb.org` | 可选 API 权限，在保存非空凭据时请求 |

没有全站网页访问、`tabs`、浏览历史或 Cookie API 权限，没有远程执行代码。豆瓣建议请求可能由浏览器按站点规则自然携带已有会话；扩展不读取、记录或导出 Cookie 内容。详细说明见 [PRIVACY.md](PRIVACY.md)。

## 开发、测试与打包

普通用户只需安装 ZIP；开发者才需要 Node.js 20+。

```powershell
npm run check
npm test
```

测试覆盖页面解析、ID 与同名电影匹配、权限和版本同步、Metascore 跳转、缺失评分、五个来源的 32 种组合及总开关联动、旧设置迁移、关闭后的请求抑制。

可选浏览器回归需要自行安装 Playwright。测试使用本地模拟页面和模拟扩展 API，不登录网站或发送真实评分请求：

```powershell
node tools/verify-rating-controls.mjs
```

如果使用自己的 Chrome，可设置 `FILM_BRIDGE_CHROME_PATH`；脚本也接受 Playwright 包路径作为第一个参数。覆盖六种页面布局、空框 / 间距、即时开关、多设置页同步、快速点击、迟到响应、无 API 数据和重新打开设置页。

在 Windows 上生成安装包：

```powershell
npm run package
```

输出 `dist/film-bridge-v版本号.zip`，根目录直接含 `manifest.json`。只包含扩展运行文件、尺寸图标与文档，不包含 Git、测试、工具或本地凭据。已有同名 ZIP 时脚本会停止，避免悄悄覆盖发布资产。

```text
manifest.json             扩展清单
src/shared.js             统一设置规则、标题 / ID / 评分工具
src/background.js         跨站匹配、缓存与可选 API
src/content.js            详情页识别、挂载和动态导航
src/widget-styles.js      隔离的页面内评分卡样式
src/options.*             来源、API 与行为设置
src/popup.*               工具栏入口
icons/                    品牌图标
tests/                    Node 自动测试
tools/                    图标生成、浏览器回归和发布打包
PRIVACY.md                公开隐私政策
CHANGELOG.md               更新记录
```

修改后在扩展管理页重新加载并刷新旧电影页。发布时请同步 `manifest.json`、`package.json`、设置页版本、README 及更新记录。

## 数据来源与免责声明

Film Bridge 是独立的非官方工具，与豆瓣、Letterboxd、IMDb、TMDB、Metacritic、Google 或 Microsoft 无隶属、赞助或背书关系。相关商标与数据属于各自权利人。扩展不批量采集或上传观影记录；用户应遵守数据源的使用条款与配额。

This product uses the TMDB API but is not endorsed or certified by TMDB.

[TMDB 官方使用与署名说明](https://developer.themoviedb.org/docs/faq) · [OMDb 官方网站与数据许可](https://www.omdbapi.com/)
