# API 接口

除 `/health`、本地图形页面及带签名的本地文件下载外，API 需 `Authorization: Bearer <API_TOKEN>`；本地图形界面使用 HttpOnly 会话 Cookie，写入请求还需同源 Origin。JSON 请求需 `Content-Type: application/json`。导入和总结返回 `job_id`，通过 `GET /api/jobs/{id}` 查询 `queued/running/done/failed`、结果与重试次数。失败最多重试三次，指数退避。

- `POST /api/import/url`：`{"url":"https://example.com/article","title":"可选","body":"抓取失败时提供的正文","duplicate":"skip"}`。
- `POST /api/import/github`：`{"url":"https://github.com/owner/repo"}`。只取公开仓库元数据和 README。
- `POST /api/import/text`：`{"title":"笔记","body":"正文"}`。
- `POST /api/import/file`：multipart，字段名 `file`，20 MiB 默认上限（ZIP 导入上限 100 MB），支持 png/jpg/jpeg/webp/pdf/docx/txt/md。
- `POST /api/import/batch`：`{"items":[{"kind":"url","url":"https://example.com"},{"kind":"text","title":"x","body":"y"}]}`，最多 100 项。
- `POST /api/ask`：`{"question":"..."}`，返回 `answer` 和实际检索的 `citations`。
- `GET /api/reviews?limit=200`：评分与复盘列表，支持可选 `status` 过滤。
- `PATCH /api/resources/{notionPageId}/review`：`{"score":10,"user_note":"亮点","reminder_date":"2026-11-07","review_status":"待复盘 (Pending)"}`；更新成功后同步 Notion 页面属性和本地索引。`reminder_date` 可传 `null` 清除。
- `POST /api/reviews/weekly`：生成本周分层复盘及评分降序汇总表，并保存本地报告历史。
- `POST /api/reviews/weekly/archive`：`{"id":"<weekly report UUID>"}`，在 Collections 新建私有归档专题并关联报告内资料。
- `POST /api/reviews/weekly/mark-reviewed`：`{"id":"<weekly report UUID>"}`，批量把报告资料设为 `已复盘 (Reviewed)`。
- `POST /api/collections/{id}/summarize`：返回任务 ID。
- `POST /api/export/collection`：`{"id":"<collection UUID>"}`，返回任务 ID。完成后 `GET /api/export/{jobId}/download` 返回短期签名 URL；导出任务 24 小时后拒绝领取。
- `POST /api/import/archive`：multipart ZIP，校验 manifest、SHA-256 和路径后导入；默认跳过重复；可加 `?duplicate=merge` 或 `?duplicate=copy`。
- `POST /api/index/rebuild`：从 Notion 重建索引，发现新页面并移除已删除页面；Worker 每日同步一次，也可人工触发。

OCR 与文本模型独立配置：本机模式默认先使用 macOS Vision；扫描 PDF 目前处理前五页。AI 问答使用关键词和元数据检索，不支持语义向量召回；无可核验编号引用时拒答。

## 图形界面新增接口

- `GET /api/system`：本地运行状态和数量统计。
- `GET /api/settings`：返回模型提供商、模型名、密钥是否已配置及目录；不返回密钥本身。
- `POST /api/settings`：可提交 `provider`、`model`、`reasoning_model`、`base_url`、对应 API Key、OCR 配置和 `storage_dir`，仅本地模式。
- `GET /api/settings/notion-test`：验证 Notion 数据源与权限。
- `GET /api/settings/ai-test`：Mock 下不产生远端调用，其他提供商会产生一次小型真实请求。
- `GET /api/guide`：返回 `docs/USER_GUIDE.md` 内容。
- `POST /api/system/stop`：关闭本地服务。
- `GET /api/resources`、`GET /api/resources/{id}`：本地检索索引列表和详情。
- `GET /api/collections`、`POST /api/collections`、`POST /api/collections/{id}/resources`：专题列表、创建、关联资料。
- `GET /api/jobs`、`POST /api/jobs/{id}/retry`：任务列表与失败重试。
# API 概览

本服务也提供浏览器图形界面；日常使用不需要手动调用 API。默认本地地址为 `http://localhost:3000`，可用 `API_TOKEN` 做 Bearer Token 认证。`GET /` 会在本地界面模式下设置短期 UI 会话 Cookie。

## AI 提供商

设置页可选择 `mock`、`deepseek`、`openai`、`custom`。环境变量和界面保存均支持 `AI_PROVIDER`、`AI_MODEL`、`AI_REASONING_MODEL`、`AI_BASE_URL`、`AI_API_KEY`、`DEEPSEEK_API_KEY`、`OPENAI_API_KEY`。DeepSeek 使用 OpenAI 兼容 Chat Completions 与 JSON mode；分类提示包含 JSON 字样和字段示例。兼容服务可指定自有 Base URL 与模型名；本机 Ollama 可在 `http://localhost:11434/v1` 使用空 API Key。Mock 无需密钥。

视觉/OCR 独立配置：`OCR_ENGINE=auto|local|openai|custom|off`；本机模式先用 macOS Vision。DeepSeek 文本模型不会接收图片。真实视觉 API 的 `OCR_API_KEY`、`OCR_BASE_URL` 和 `OCR_MODEL` 与文本模型分开设置。

调用连接测试接口会产生一条很小的真实模型请求（Mock 模式除外），可能消耗少量额度。当前默认 DeepSeek 模型按官方现行名称填写；模型可在 GUI 手动修改。

## 核心端点

- `POST /api/import/url`、`/github`、`/text`、`/file`、`/batch`：资料导入。
- `POST /api/ask`：知识库问答，可选分类与标签范围。
- `POST /api/collections/{id}/summarize`：跨资料专题总结。
- `POST /api/export/collection`：生成专题 ZIP；下载使用有时效的签名地址。
- `GET /api/jobs`、`POST /api/jobs/{id}/retry`：任务状态与失败重试。
- `GET /api/guide`：返回 `docs/USER_GUIDE.md` 手册文本。
- `GET /api/settings`、`POST /api/settings`：读取非敏感设置状态并安全保存本地配置。Key 只写入服务端 `.env`，读取接口不回显。
- `GET /api/settings/notion-test`、`GET /api/settings/ai-test`：连接测试。

错误响应为 `{ "error": "..." }`；敏感配置值会从服务端错误日志中脱敏。

