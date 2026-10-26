// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（教程、观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。公开接口、RSS 和 MCP 里要把一类并进另一类发布，写在站点设置里（site/site.ts 的 PUBLIC_CATEGORIES）。
 */
export const CATEGORIES = [
  { key: "benchmarks", label: "基准", feedLabel: "评测基准", section: "榜单与评测", guide: "榜单、基准和评测集本身的变化：新基准或新榜单上线、题库与协议换版、评测口径与信度批评、对榜单方法的讨论。读者得到的是一把新的尺子，或尺子本身改了；某个模型在榜上拿了多少分归“成绩”。" },
  { key: "scores", label: "成绩", feedLabel: "评测成绩", section: "榜单与评测", guide: "既有榜单上的新结果：模型在某个基准上的分数与名次变化、SOTA 易主、复现、复现失败与打假、厂商拿榜单做的宣传。榜单本身没变，变的是谁排在哪；新基准上线时顺带公布的首批成绩归“基准”。" },
  { key: "datasets", label: "数据集", feedLabel: "数据集", section: "数据与标注", guide: "数据集和评测集本身：发布、规模与构成、标签体系、许可与用途限制、版本变化与污染问题。读者关心的是这份数据能不能用、能不能拿到，不是标注流程怎么做。" },
  { key: "data-ops", label: "数据工程", feedLabel: "数据工程", section: "数据与标注", guide: "把数据做出来的过程与供给：标注与采集、人评与众包、合成数据、清洗与质量控制、数据服务商的交付与定价。读者关心的是怎么产出和采购数据，不是某份数据集的内容。" },
  { key: "tools", label: "工具", feedLabel: "评测工具", section: "工具与平台", guide: "评测与数据工作的工具和平台：评测框架与 harness、LLM-as-judge 这类评判工具、评测平台与 API、榜单网站与观测实验工具。模型和数据集本身不因为被拿来评测或被打包就归到这里。" },
  { key: "industry", label: "行业", feedLabel: "行业动态", section: "行业动态", guide: "已发生的经营与规则事件：融资并购、人事、政策监管、合作采购、诉讼、真实事故与调查进展；厂商发布新模型、新版本这类公司动作也归这里。当事人自己发帖带态度，也不因此变成观点。" },
  { key: "commentary", label: "观察", feedLabel: "观察", section: "观察", guide: "教程、复现笔记、方法论讨论、观点与访谈：重点是作者的做法或判断，没有给出新基准、新成绩、新数据集或新工具。作者是名人不自动归这里，讨论市场不自动归行业。", commentary: true },
] as const satisfies ReadonlyArray<{ key: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布（这里是新基准）：日报报头的“N 个新基准”、改分类后修订已出的报告都按它数。
 * category 是类别，tag 是标签，两者都对上才算；unit 接在数字后面。
 * 没有这样一类的行业设成 null，报头就不显示这个数。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "benchmarks", tag: "新基准", unit: "个新基准" };

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = ["ai", "api", "llm", "gpu", "agi", "ceo", "ipo", "benchmark", "benchmarks", "eval", "evals", "dataset", "datasets", "sota", "leaderboard"];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["benchmark_release", "score_update", "dataset_release", "data_workflow", "eval_tool", "industry_event", "commentary"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一；最后一个是模型没给分类标签时的兜底。 */
export const CATEGORY_TAGS = [
  "基准发布", "新基准", "成绩更新", "数据集", "数据工程", "工具", "行业动态", "观察", "开源", "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "代码评测", "Agent 评测", "多模态评测", "长上下文", "数学推理", "安全评测", "中文评测", "领域评测",
  "榜单方法", "复现", "基准污染", "数据标注", "合成数据", "数据许可", "人评众包", "成本与延迟",
] as const;

/** 可选的实体标签（公司、机构、平台）。 */
export const ENTITY_TAGS = ["Hugging Face", "Epoch AI", "LMArena", "Artificial Analysis", "Scale AI", "Surge AI", "Mercor", "OpenAI", "Anthropic", "Google", "DeepSeek", "Meta", "xAI", "Qwen"] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  "评测/基准": "基准发布", 基准: "基准发布", 榜单: "基准发布", 排行榜: "基准发布", 新榜单: "基准发布",
  benchmark: "基准发布", benchmarks: "基准发布", leaderboard: "基准发布",
  成绩: "成绩更新", 跑分: "成绩更新", 分数: "成绩更新", 排名: "成绩更新", sota: "成绩更新", 刷分: "成绩更新",
  dataset: "数据集", datasets: "数据集", 评测集: "数据集", 基准集: "数据集",
  标注: "数据工程", 标注数据: "数据工程", 众包: "数据工程", 数据采集: "数据工程", "数据/训练": "数据工程",
  评测工具: "工具", 框架: "工具", 平台: "工具", harness: "工具",
  融资: "行业动态", 收购: "行业动态", 投资: "行业动态", 并购: "行业动态", 合作: "行业动态", 生态: "行业动态",
  公司动态: "行业动态", 动态: "行业动态", 行业: "行业动态", 政策: "行业动态", 监管: "行业动态", 法规: "行业动态", 诉讼: "行业动态", 事故: "行业动态",
  观点: "观察", 评论: "观察", 教程: "观察", 实践: "观察", 技巧: "观察", 访谈: "观察", 复现笔记: "观察", 方法: "观察",
  "open-source": "开源", 开源生态: "开源", 仓库: "开源", repo: "开源",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；otherNames 是公司自己的其他称呼（官方账号名、子品牌），
 * 把事实的主体对到发布方时也认它们。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; otherNames?: string[] }> = {
  "world-labs": { name: "World Labs", displayTag: null, aliases: ["World Labs"] },
  "thinking-machines": { name: "Thinking Machines Lab", displayTag: null, aliases: ["Thinking Machines"] },
  amd: { name: "AMD", displayTag: null, aliases: ["AMD", "Advanced Micro Devices"] },
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI", "ChatGPT", "Sora", "Codex", "GPT"], otherNames: ["OpenAI Developers"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic", "Claude"], otherNames: ["Claude Code"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "DeepMind", "Gemini", "谷歌"], otherNames: ["Google DeepMind", "Google Research", "Google AI", "Google Labs", "Google Cloud"] },
  deepseek: { name: "DeepSeek", displayTag: "DeepSeek", aliases: ["DeepSeek", "深度求索"] },
  qwen: { name: "千问 Qwen", displayTag: null, aliases: ["Qwen", "通义", "阿里"], otherNames: ["通义千问", "千问", "千问APP", "Qwen Team", "通义实验室", "阿里巴巴", "Alibaba", "阿里云", "Alibaba Cloud"] },
  kimi: { name: "Kimi / 月之暗面", displayTag: null, aliases: ["Kimi", "月之暗面", "Moonshot"], otherNames: ["Moonshot AI"] },
  minimax: { name: "MiniMax", displayTag: null, aliases: ["MiniMax", "海螺"], otherNames: ["稀宇科技"] },
  zhipu: { name: "智谱 GLM", displayTag: null, aliases: ["智谱", "GLM", "Z.ai"], otherNames: ["智谱AI", "Zhipu", "Zhipu AI"] },
  xai: { name: "xAI", displayTag: "xAI", aliases: ["xAI", "Grok"], otherNames: ["SpaceXAI"] },
  meta: { name: "Meta", displayTag: "Meta", aliases: ["Meta", "Llama"], otherNames: ["Meta AI", "AI at Meta"] },
  microsoft: { name: "Microsoft", displayTag: "Microsoft", aliases: ["Microsoft", "微软", "Copilot"], otherNames: ["Microsoft Research", "Microsoft AI"] },
  nvidia: { name: "NVIDIA", displayTag: null, aliases: ["NVIDIA", "英伟达"] },
  "hugging-face": { name: "Hugging Face", displayTag: "Hugging Face", aliases: ["Hugging Face"], otherNames: ["HuggingFace"] },
  cursor: { name: "Cursor", displayTag: null, aliases: ["Cursor", "Anysphere"] },
  openrouter: { name: "OpenRouter", displayTag: null, aliases: ["OpenRouter"] },
  // 评测与数据一侧的机构：榜单、评测机构、数据服务商
  "epoch-ai": { name: "Epoch AI", displayTag: "Epoch AI", aliases: ["Epoch AI", "Epoch"], otherNames: ["EpochAI"] },
  "lma-arena": { name: "LMArena", displayTag: "LMArena", aliases: ["LMArena", "LMSYS", "Chatbot Arena"], otherNames: ["lmarena.ai", "LMSYS Org"] },
  "artificial-analysis": { name: "Artificial Analysis", displayTag: "Artificial Analysis", aliases: ["Artificial Analysis"], otherNames: ["artificialanalysis.ai"] },
  "scale-ai": { name: "Scale AI", displayTag: "Scale AI", aliases: ["Scale AI"], otherNames: ["scale.com"] },
  "surge-ai": { name: "Surge AI", displayTag: "Surge AI", aliases: ["Surge AI"], otherNames: ["surgehq.ai"] },
  mercor: { name: "Mercor", displayTag: "Mercor", aliases: ["Mercor"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "openai", name: "OpenAI", patterns: [/openai|chatgpt|\bgpt-?[o\d]|\bsora\b|\bcodex\b/i] },
  { id: "anthropic", name: "Anthropic", patterns: [/anthropic|\bclaude\b/i, /\b(?:opus|sonnet|haiku)\s*\d+(?:[.\-]\d+)*\b/i, /\bfable\s*\d+(?:[.\-]\d+)*\b|\bmythos\b/i] },
  { id: "google", name: "Google / Gemini", patterns: [/google|deepmind|\bgemini\b|notebooklm|\bveo\s?\d|\bAlphaFold\b|\bAMIE\b/i] },
  { id: "deepseek", name: "DeepSeek", patterns: [/deepseek|深度求索/i] },
  { id: "xai", name: "xAI / Grok", patterns: [/\bxai\b|\bgrok\b/i] },
  { id: "meta", name: "Meta / Llama", patterns: [/\bMeta\b/, /\bmeta\s?ai\b|\bllama\b/i] },
  { id: "microsoft", name: "Microsoft / Copilot", patterns: [/microsoft|copilot|微软/i] },
  { id: "nvidia", name: "NVIDIA", patterns: [/nvidia|英伟达|\bnemotron\b|\bnemo\b|\bblackwell\b|\brubin(?:\s+ultra)?\b|\bcuda\b/i] },
  { id: "qwen", name: "千问 Qwen", patterns: [/\bqwen|通义|千问/i] },
  { id: "hugging-face", name: "Hugging Face", patterns: [/hugging\s?face/i] },
  { id: "cursor", name: "Cursor", patterns: [/\bCursor\b/] },
  { id: "kimi", name: "Kimi / 月之暗面", patterns: [/\bkimi\b|月之暗面|\bmoonshot\s?ai\b/i] },
  { id: "openrouter", name: "OpenRouter", patterns: [/openrouter/i] },
  { id: "minimax", name: "MiniMax", patterns: [/minimax/i] },
  { id: "zhipu", name: "智谱 GLM", patterns: [/智谱|\bglm-?[4-9]/i] },
  { id: "hunyuan", name: "腾讯混元", patterns: [/混元|hunyuan/i] },
  { id: "doubao", name: "字节豆包", patterns: [/豆包|doubao|字节跳动|bytedance/i] },
  { id: "mistral", name: "Mistral", patterns: [/mistral/i] },
  { id: "perplexity", name: "Perplexity", patterns: [/\bPerplexity\b/] },
  { id: "runway", name: "Runway", patterns: [/\brunway\b/i] },
  { id: "suno", name: "Suno", patterns: [/\bsuno\b/i] },
  { id: "midjourney", name: "Midjourney", patterns: [/midjourney/i] },
  { id: "stability-ai", name: "Stability AI", patterns: [/stability\s?ai/i] },
  { id: "elevenlabs", name: "ElevenLabs", patterns: [/eleven\s?labs/i] },
  { id: "vllm", name: "vLLM", patterns: [/\bvllm\b/i] },
  { id: "ollama", name: "Ollama", patterns: [/\bollama\b/i] },
  { id: "windsurf", name: "Windsurf", patterns: [/windsurf/i] },
  { id: "devin", name: "Devin", patterns: [/\bdevin\b/i] },
  { id: "manus", name: "Manus", patterns: [/\bmanus\b/i] },
  { id: "apple", name: "Apple AI", patterns: [/\bapple\s?(intelligence|silicon|ai)\b|苹果(智能|\s?AI)/i] },
  { id: "amazon", name: "Amazon / AWS", patterns: [/amazon|\baws\b|亚马逊/i] },
  { id: "baidu", name: "百度文心", patterns: [/百度|baidu|文心|\bernie\s?bot\b/i] },
  { id: "epoch-ai", name: "Epoch AI", patterns: [/epoch\s*ai/i] },
  { id: "lma-arena", name: "LMArena", patterns: [/lma\s*arena/i, /lmsys|chatbot\s*arena/i] },
  { id: "artificial-analysis", name: "Artificial Analysis", patterns: [/artificial\s*analysis/i] },
  { id: "scale-ai", name: "Scale AI", patterns: [/scale\s*ai/i] },
  { id: "surge-ai", name: "Surge AI", patterns: [/surge\s*ai/i] },
  { id: "mercor", name: "Mercor", patterns: [/mercor/i] },
];

/** 这些域名上的文章，发布方就是对应的公司（托管平台如 GitHub、arXiv 不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "openai", domains: ["openai.com"] },
  { entityId: "anthropic", domains: ["anthropic.com", "claude.com"] },
  { entityId: "google", domains: ["deepmind.google", "ai.google", "blog.google"] },
  { entityId: "deepseek", domains: ["deepseek.com"] },
  { entityId: "xai", domains: ["x.ai"] },
  { entityId: "meta", domains: ["ai.meta.com"] },
  { entityId: "microsoft", domains: ["microsoft.com"] },
  { entityId: "nvidia", domains: ["nvidia.com"] },
  { entityId: "qwen", domains: ["qwen.ai"] },
  { entityId: "cursor", domains: ["cursor.com"] },
  { entityId: "openrouter", domains: ["openrouter.ai"] },
  { entityId: "epoch-ai", domains: ["epoch.ai"] },
  { entityId: "lma-arena", domains: ["lmarena.ai"] },
  { entityId: "artificial-analysis", domains: ["artificialanalysis.ai"] },
  { entityId: "scale-ai", domains: ["scale.com"] },
  { entityId: "surge-ai", domains: ["surgehq.ai"] },
  { entityId: "mercor", domains: ["mercor.com"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "meta", pattern: /@AIatMeta\b/i },
  { entityId: "zhipu", pattern: /\bZhipu(?:\s+AI\b|['’]s\b)/i },
];
