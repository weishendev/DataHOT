# 给 Agent 的说明

这是一个行业热点网站的框架：采集信源、用模型筛选和写作、归组事件、出日报周报月报，并通过网站、RSS、公开 API、Agent Markdown 和 MCP 对外提供。默认配置是一个 AI 行业的示例站。先读 README，再按任务读 `docs/` 里对应的文档。

## 这个站现在的状态（2026-10-23，DataHOT）

这是从 AIHOT 框架改出来的「AI 数据 × 评测基准」站，不再是示例站。接手的人先看这一节。

- **站点**：站名 DataHOT，行业词 `AI数据和benchmark`，MCP 前缀 `datahot`，周报与日报同为 08:00。读者是 AI 数据公司的员工（数据 sourcing、标注交付、评测团队）。
- **分类**（`industry/taxonomy.ts`）：7 类 —— benchmarks 基准 / scores 成绩 / datasets 数据集 / data-ops 数据工程 / tools 工具 / industry 行业 / commentary 观察，日报分 5 节：榜单与评测、数据与标注、工具与平台、行业动态、观察。`RELEASE` 是「新基准」，报头按它数「N 个新基准」。
- **主题**（`industry/topics.json`）：41 个，公司 21（含 Epoch AI、LMArena、Artificial Analysis、Scale AI、Surge AI、Mercor 等 6 家新增）+ 评测方向 12 + 内容形态 8。slug 上线后不要改。
- **信源**（`industry/sources.json`）：77 个 —— RSS 28（含 `https://aihot.news/feed.xml`，T1）、JSON 接口 2、网页列表 6、X 账号 41。没有接入的：6 个公众号（缺 ghid）、VentureBeat（Cloudflare 429，已暂停）、Stanford AI Index / State of AI / Meta AI（页面不是新闻流）。METR 的 feed 和 HN 首页在容器里抓不到。
- **精选**：`industry/prompts/selection-score.md` 已按这个行业重写（七类内容类型、五轴按「行业影响 / 新东西 / 站不站得住 / 对读者的用处 / 能不能上手」）。门槛在 `industry/selection.ts`：T1 62 / T1_5 54 / T2 62，来自 `.data/gold.jsonl` 116 条标注（90 条可判定）的校准，查准 0.885 / 查全 0.885。没有留出集。改提示词或门槛后要重跑 `scripts/eval-selection.ts`。
- **旧数据**：库里更早的文章按旧提示词和旧分类判过，没有重算；提示词版本是内容哈希，只影响之后的新资料。
- **出网**（这台机器特有）：宿主机上 Node 的 DNS 会被污染，直连抓不到 Hugging Face、arXiv、HN、Reddit、Import AI 等。绕开的办法是把 `.env` 里的 `EGRESS_PROXY_URL` 打开（Docker 里写 `http://host.docker.internal:7890`），同时 `packages/backend/src/lib/egress-proxy.ts` 的 DoH 超时已从 5 秒改成 20 秒（本机代理冷启动约 7.5 秒，不改会全部超时）。`site/site.ts` 的 `DEPLOYMENT.directFetchHosts` 为 `["openai.com", "metr.org"]`，这两个直连更快。2026-10-26 已在本机 `.env` 中启用上述 Docker 代理地址；依赖宿主机的 7890 代理保持运行。X 等付费 API 仍按现有规则直连。
- **金标文件**：`.data/gold-candidates.jsonl`（116 条，材料全文）、`.data/gold-review.csv`（给人标，`decision` 列填 s / r / e）、`.data/gold.jsonl`（评测用）。`scripts/_gold-apply.ts` 是临时脚本，把 CSV 的标注合并成 gold.jsonl，不是框架的一部分。
- **本机跑测试**：需要一个 127.0.0.1:5432 的 postgres（本机用临时容器 `aihot-test-pg` 起）。一次 116 条的评测要 348 次模型调用，测试库的 `budgets.llm.per_minute` 要从 300 调到 3000，否则会大面积报 `Budget ... exhausted (minute)`。备份测试需要本机有 `pg_dump`，没有时会失败 8 条，与代码无关。
- **待办**：6 个公众号等 ghid；41 个 X 源会打满 SocialData 每分钟预算，需要调额度或减源。

## 最常见的任务：改成另一个行业

按 `docs/customize.md` 的顺序做。这个站自己的东西在 `site/`：站名文案（`site.ts`）、每一步的模型（`models.ts`）、品牌与 Logo（`brand/`）、条款页（`pages/`）、发布在网站根目录的固定文件（`public/`，替换占位符后发布）、更新日志（`changelog.json`）。行业知识在 `industry/`：分类标签（`taxonomy.ts`）、主题（`topics.json`）、示范信源（`sources.json`）、提示词（`prompts/`）、门槛（`selection.ts`）。通常不需要改 `apps/` 和 `packages/`；框架里没有、只有这个站要的功能，做成模块放进 `modules/`（`docs/architecture.md` 的“模块”）。

这些事要问使用者本人，不要替他决定：站名；要盯哪些信源；什么消息重要、什么是噪声；分类怎么分；条款和隐私说明的内容（`site/pages/` 是模板，上线前需要他本人确认）。

改评分标准时保留原有结构（内容类型、五个维度加权、噪声压制、安全边界），替换的是“什么算重要”“什么算噪声”的例子。门槛要用使用者标注的样本重新校准（`docs/selection.md`），不要凭感觉改数字。

## 运行与检查

- Node.js 24 直接运行 TypeScript，后端没有构建步骤。npm workspaces：`apps/*`、`packages/*`、`industry`、`site`、`modules/*`。
- 本机运行和 Docker 见 `docs/deploy.md`。
- 改完至少跑：
  ```bash
  npm run typecheck
  DATABASE_URL=postgres://127.0.0.1:5432/<名字>_test npm test   # 名字必须以 _test 或 _ci 结尾；没有会自动建好并迁移，账号要能建库
  npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts
  node scripts/smoke.ts --base http://localhost:3000             # 站点跑起来以后
  ```
- `tests/` 里部分测试用的是示例行业的分类、标签和公司，改了 `industry/taxonomy.ts` 后把这些例子换成新行业的对应项。

## 要守住的规则

- 前端（`apps/web`）只通过 HTTP 读 `apps/api`，数据库、模型调用和密钥只在后端。
- 所有公开出口都从 `packages/backend/src/publication/` 这一个读取层读，新增公开出口也一样。
- 读者打开页面不触发模型调用；模型只在 worker 的任务里调用。
- 付费请求都经过回执（`providers/receipts.ts`）和预算熔断，不要绕开。
- 安全阀只有设成 `true` 才打开。开发时保持关闭：`COLLECT_ENABLED`、`MODEL_CALLS_ENABLED`、`FEISHU_*_ENABLED`、`INDEXNOW_SUBMIT_ENABLED`。测试里推送一直关着，采集和模型调用只连本地假服务，不访问任何外部服务。
- 信源默认只展示摘要和原文链接（`site_fulltext` 关）；只有来源明确允许时才打开全文。
- 公开内容匿名，管理员和访客看到的一样；后台只允许管理员。
- 停用或替换一个功能、机制时，同一个改动删掉它的代码、测试、文档和存下的状态（库表与列、定时任务、settings、环境变量和 `.env.example` 里的项）；会删掉使用者已有数据的，在 `docs/deploy.md` 的更新说明里写明。加锁、重试、兼容旧格式、开关和兜底，先要有证据：真实部署里发生过，或平台的语义决定它会发生。
- 数据库迁移放在 `database/migrations/`（只属于某个模块的表放在它的 `migrations/`），按完整文件名排序执行和记账；编号相同的不同文件分别执行，新增迁移使用新的文件名，已经发布的迁移不改。从 `0055` 起，每个文件只放一条允许在线执行的语句，PR 会检查；索引使用 `CONCURRENTLY IF NOT EXISTS`，大批数据回填不放进发布迁移。约束验证和破坏性变更先按 [迁移约定](docs/architecture.md#数据库迁移) 设计，不能修改历史文件或关闭检查绕过。
- 不要提交 `.env`、密钥和 `.data/`。
- 不要使用 AIHOT 的名字和 Logo。

## 写代码

匹配周围代码的写法、命名和注释密度。选能清楚解决问题的简单方案，只定义正在使用的抽象。验证改动涉及的重要行为，不为简单的样式改动写测试。

## 给本仓库提 PR

要把改动提回 `KKKKhazix/AIHOT` 时，先读 `CONTRIBUTING.md`。下面是评审里最常被退回或返工的情况：

- **只收对所有站都成立的改进。** 新开关、新的配置入口和新功能再小也算产品行为，先开 Issue 讲清场景：每个开关所有站都要长期维护，没讨论就提交的这类 PR 大多没有收。你们站自己的规定、数字和例子留在自己的 `industry/`、`site/`，不写进共享的提示词模板、注释和测试。
- **先找现有的。** 加函数、插口或配置前先搜一遍，常见能力多半已有一份：模块发自己的文件用 `apps/api/src/routes/static.ts` 的 `sendFile`，接中转站填 `LLM_BASE_URL`。再写一份，两处迟早不一致。
- **测试只证明你想到的情况。** 动了采集、日期、正文清洗、精选或归组的，拿一批公开的真实订阅和网页跑改动前后，在 PR 里写有多少条结果变了、变的是否都对。中文网页的时间常不带时区，按信源时区读（默认 `+08:00`），上面的 “CST” 一般指北京时间；测试结果不能取决于运行机器的时区。
- **改全。** 新的环境变量写进 `.env.example`，新的站点配置写进 `site/`；改了配置字段的意思，示例配置跟着改，让已部署的站升级后行为不变（比如改成只给声明了 `vision` 的模型附图，本来就能看图的预设要补上声明）；改一个读者看到的名字或入口，出现它的地方一起改。新增或更改导航配置时，分别核对默认配置与非默认配置的电脑侧栏、手机底栏、返回和“我的”入口，入口变少时的标签布局也要在浏览器里看；默认值不变只能证明原行为，不能证明配置可用。
