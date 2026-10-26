# 数据需求分析周报

DataHOT 的站点模块。分析思路参考 [AI Dataset Radar](https://github.com/liuxiaotong/ai-dataset-radar/tree/e5f627be3e1c8b4363007e37ffd13447b612edcd) 的数据需求信号与数据类型分类，使用本站已有材料重新实现分析流程。

## 运行

- 桌面「内容」侧栏：数据需求分析周报；手机「我的」页也能进入。
- 最新期 `/data-demand`，固定刊期 `/data-demand/2026-W43`；接口 `/api/site/modules/data-demand` 和 `/api/site/modules/data-demand/2026-W43`。
- 每周一北京时间 08:00 起生成上一个完整自然周，每半小时检查最新应出刊周；已出刊不重写，停机后补最近一期，不自动批量补历史。
- 安全阀 `MODEL_CALLS_ENABLED` 关闭时不调模型、不生成报告。没有已分析公开材料时保留空缺，不声称当周没有市场需求。
- 首期没有历史基线；之后比较紧邻的上期，词表参考之前八期。每期最多分析 230 件去重材料，优先为 HF/GitHub 扫描保留最多 30 个位置，其余按现有评分选取，未入选精选的资料同样参与。
- 抽取只读已采集的标题、摘要与正文前 1600 字符，不增加外部抓取。每份材料最多两个信号，按既有事实归组去重。证据必须是输入中的连续短句；不支持的机构名剔除。
- 细分数据类型可扩展；用历史词表合并同义名称，保留 typeKey。供给活动、潜在需求和明确需求分别标示，数量变化仅表示本站信号变化。
- 公开读取必须经过 `publication/module-pages.ts`。每次读取核对引用的可见性与修订；引用失效的信号和关联分析隐藏。历史依据变化时停止展示原环比与综合判断，不在阅读请求中重跑模型。

- 呈现参考 [W31 HTML](https://knowlyr.com/insights/2026-W31.html)：默认三条关注点、12 行四列表格，其余类型与证据展开查看。强度是本站去重事件数量（极强 ≥5、强 3–4、中 2、弱 1），不是采购意愿或市场规模。首期趋势标为基线。

## HF / GitHub 免费扫描

组织名单在 `industry/data-demand.ts`，来自上述参考仓库并合并大小写别名：79 个 HF 组织（数据集、模型分别监控）、50 个 GitHub 组织。新增信源以 `external` 类型显示在现有后台，可暂停、调整周期、手动抓取；不会新增 X 账户。管理员改过的启停和周期不会被种子覆盖。

每五分钟扫描一个到期组织列表，默认每组织每天一次。读取数据集与模型元数据（下载量、点赞、标签、声明的数据集）、仓库元数据（stars、forks、描述、topics），最多补读两份变化内容的 README；同一版本复用说明文档。私有、停用、归档与 fork 仓库不进入。GitHub 另做数据、评测、智能体、机器人等关键词过滤。只读取公开元数据和短说明，不下载数据集、权重或仓库，不运行远端代码。

每个信源维护独立成功水位线和分页位置，首轮看最近 14 天，后续重叠一天以补迟到更新。每页最多 100 项，跨页下次续扫；失败不推进水位线。观察值存入 `data_demand_assets`，新发布、内容更新、达到阈值的热度变化才形成规则材料，同一资产每周一个材料。首次观察只建热度基线，HF 下载量明确标注为平台统计窗口，不冒充新增下载数或采购需求。

扫描仅使用免费公开 API。GitHub 可选复用现有 `GITHUB_TOKEN`，不要求令牌；无认证额度按 IP 计算，遇到 403/429 等待至少一小时并遵守返回的重置时间。正常定时扫描最多每小时 36 次平台请求；手动扫描也应遵守上游额度。错误与分页进度可在原有信源/运行记录里查看。扫描受 `COLLECT_ENABLED` 约束，规则材料不触发新闻评分模型，后续周报分析仍受同一个 10 元预算约束。

```sh
node --env-file=.env modules/data-demand/scripts/scan.ts
node --env-file=.env modules/data-demand/scripts/scan.ts demand-hf-dataset-allenai
node --env-file=.env modules/data-demand/scripts/scan.ts demand-github-allenai
```

## 模型与费用

`site/models.ts` 的 `data-demand-flash`、`data-demand-pro` 复用本站现有 DeepSeek 主账号（`LLM_BASE_URL`、`LLM_API_KEY`）。后台「模型与评测」可分别选择抽取、周报模型；环境覆盖为 `DATA_DEMAND_EXTRACT_MODEL`、`DATA_DEMAND_REPORT_MODEL`。更换服务商时一起改具名模型的账号变量与 `site/data-demand.ts` 的人民币单价。

默认每月保守预留上限 10 元，配置在 `site/data-demand.ts`。每次实际付费尝试发送前，用输入 UTF-8 字节数加消息开销、最大输出额度和高峰未命中缓存价格预留费用。使用数据库原子条件更新，未知或失败请求不退预留，重用已有回执不重新预留。预留额是计费上界估算，实际 token 用量见原有模型统计；价格上涨需同步更新配置。

预算不足时该次出刊失败并记入后台运行记录，保留此前已完成的抽取和回执，下月可继续。不会自动切到另一家收费服务。没有人民币定价的模型会在发送前被拒绝。

在正常部署环境手动补最近一期，或指定已结束的周：

```sh
node --env-file=.env modules/data-demand/scripts/compose.ts
node --env-file=.env modules/data-demand/scripts/compose.ts 2026-W43
```

手动执行同样受安全阀、出刊时间、回执与月度预算约束。

## 验证

后端测试在模块 `tests/` 中，使用隔离数据库与本地假服务，覆盖扫描水位线与分页、资产变化、重复扫描、窗口、细分类型、证据、预算并发、回执恢复和撤回。页面测试在 `apps/web/tests/data-demand.test.ts` 中，验证侧栏、手机、往期、视觉信号、证据展开与空状态。
