# Notion AI Personal Knowledge System

以 Notion 三个数据源保存正式资料、专题和任务。默认本地模式使用 PGlite 持久化任务和检索索引，并把上传文件、附件、ZIP 放在本地目录；API 与任务处理运行在同一进程。可选用 Postgres 和 S3 兼容存储部署到云端。默认不开启公开分享。

## 项目特点

- **Notion 云端同步**：资料和专题保存到自己的 Notion 工作区，可以在其他已登录设备上查看。本地索引、任务状态和附件需要单独备份。
- **macOS 原生 OCR**：利用系统的 Vision 文字识别能力处理图片和扫描 PDF，无需为 OCR 单独注册云服务。扫描 PDF 当前最多识别前五页，首次使用可能需要 Apple 命令行开发者工具。
- **双击快速部署**：启动器自动检查环境、安装依赖并打开中文界面，无需自行安装或启动数据库，也不需要注册云对象存储。首次使用需要 Node.js 22 或更新版本、网络连接和自己的 Notion 授权。

## 本地快速开始（无需日常终端命令）

1. 新用户先阅读 [朋友部署指南](DEPLOY_GUIDE.md)，双击 `start.command` 自动安装、准备配置并初始化自己的 Notion 数据库。以后仍可双击 `start.command`，已安装时走快速启动。
2. 默认浏览器打开 [http://localhost:3000](http://localhost:3000)，在中文界面导入资料、问答、管理专题和任务。
3. 设置页可切换 Mock、DeepSeek、OpenAI 或自定义兼容模型，配置视觉/OCR、iCloud Drive 文件目录并测试连接。
4. 纯净发布包不包含任何人的配置、数据库和依赖。首次须使用你自己的 Notion Token 和已授权父页面；日常操作见[图形化使用手册](docs/USER_GUIDE.md)。

本地默认 PGlite + 本地文件目录；不需要 Render、外部 PostgreSQL 或 R2。`MOCK_AI=true` 不消耗模型额度。DeepSeek 文本与图片 OCR 分离，图片优先使用 macOS Vision；真实 AI 问答须在设置页填写模型密钥。服务只监听 `127.0.0.1`。命令行工具 `scripts/kb.py` 和 `run-local.command` 仍供高级操作使用。

目录：`public/` 为图形界面，`src/` 为 API 和后台任务，`migrations/` 为数据库结构，`tests/` 为自动化测试，`docs/` 为教程。

## 架构选择

比较时间：2026-10-29。方案 A：Cloudflare Workers + Queues + D1 + R2，基础费用可能更低，但 Worker 内存 128 MB、队列消费者最长 15 分钟；PDF 渲染、DOCX、ZIP 的 Node 依赖适配和大文件处理风险较高。方案 B：Render Node Web Service + 后台 Worker + Postgres + 私有 R2，常驻任务适合这些库，维护面为两个同源进程和一个数据库。如果未来选择云端部署，B 更适合现有依赖；当前默认且已验证的是本地 PGlite 与文件目录，不需要注册云数据库或对象存储。按目前公开价格，Web 和 Worker 最小付费实例各约 US$7/月，Postgres 另计；R2 有免费额度，模型与 OCR 按实际调用计。费用和上限应在正式部署前按所选区域、套餐复核。参考：[Render 定价](https://render.com/pricing)、[Render Background Workers](https://render.com/docs/background-workers)、[Cloudflare Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)、[Cloudflare Queues 限制](https://developers.cloudflare.com/queues/platform/limits/)。

## 数据流与隐私

资料创建时提取正文、计算 SHA-256 指纹、生成 AI 建议，再写入 Notion 与必要的检索索引。AI 字段与标为“原始内容”的页面块分离。重复记录默认跳过；`merge` 只追加原始正文并更新索引，保留用户字段；`copy` 创建副本。Notion 被用户编辑后的标题、摘要和标签可通过手动重建同步到索引。索引并非权威副本，备份应包含 Notion 导出、PGlite 数据目录和本地文件目录（云端模式则备份 Postgres 与对象存储）。

网页抓取只允许公开 HTTP(S)，不使用 Cookie/登录凭证。上传原文件保存在本地目录或私有桶；目前仅文本正文写入 Notion，附件链接没有写入页面。ZIP 内含已保存的原始附件，保存在受控目录或私有桶，需认证后领取短期签名下载地址。Notion 分享状态由用户在 Notion 中控制，API 不修改公开权限。

## 当前范围

已实现：中文 Web GUI 与可渲染手册、macOS 双击后台启动器、多模型设置、URL/GitHub/text/file/batch 导入、模拟 AI、结构化校验、指纹与 AI 结果缓存、任务阶段和重试、Notion schema 缓存、前 100 个页面块与属性合并写入、3 req/s 写入节流、基础关键词检索、证据编号过滤、专题摘要、ZIP 校验导回、速率限制和私有下载；Notion 启动时自动补齐评分字段，支持 P0–P3 评分面板、到期提醒、macOS 通知、AI 周末复盘、私有 Collections 周报归档与批量已复盘更新。

当前单用户 macOS 版本已在开发者机器验证 Notion 与 DeepSeek 连接及真实导入；这不代替新机器、新账户的验收。向量检索、长 PDF 超过前五页的 OCR、多用户权限与云端多环境部署仍需扩展。Mock 不代表真实 AI 分析。

## 命令

`pnpm check`、`pnpm test`、`pnpm build`、`pnpm migrate`。CI 对 push/PR 运行类型检查、测试和构建。详细接口见 [API](docs/api.md)，部署见 [部署](docs/deploy.md)，恢复见 [运维](docs/operations.md)。

## 纯净分发

运行 `node scripts/package-release.mjs` 生成白名单源码 ZIP 和 SHA-256 校验文件。不要手工压缩已使用的项目目录。发布版遵循 [MIT License](LICENSE)，第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
