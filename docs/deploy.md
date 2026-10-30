# 云端部署（无需 GitHub）

选择 Render Web + Background Worker + Postgres，外加私有 S3 兼容对象存储。用户不要求 GitHub 同步，因此 `render.yaml` 和 GitHub Actions 仅作为可选配置；实际可以把同一 Docker 镜像部署为 Web 和 Worker 两个服务。Render 官方支持从容器镜像仓库部署 [Web 与 Background Worker](https://render.com/docs/deploying-an-image)。本机只需在构建和推送镜像时运行 Docker，不需常驻服务。

1. 创建一个私有容器仓库（例如 Docker Hub）。在项目根目录运行 `docker build --platform linux/amd64 -t <用户名>/<镜像名>:<版本> .` 和 `docker push <用户名>/<镜像名>:<版本>`。Docker 不在当前电脑的 PATH 中，因此此步骤未在本次执行。
2. 在 Render 创建 Singapore 区域的 Postgres，限制外部访问；创建同区域的 Web 和 Background Worker，Source 选择 Existing Image，指向同一镜像及不可变版本标签。Web 启动命令为 `node dist/migrate.js && node dist/server.js`，Worker 为 `node dist/worker.js`。Web 健康检查为 `/health`。
3. 在 Cloudflare R2 或其他 S3 兼容平台创建私有桶，关闭公开读取。设置 `uploads/` 生命周期（例如 30 天）和 `exports/` 生命周期（例如 2 天）。生成仅有该桶读写权限的密钥。
4. 在 Render 两个服务的 Secrets 中分别设置 Notion、Postgres、对象存储、模型配置。Web 还需要随机的 `API_TOKEN`。所有值对照 `.env.example`；切勿把 `.env` 放进镜像或仓库。开发、测试、生产分别使用不同服务、数据库、桶和 Notion 集成。
5. 查看启动日志中的配置与 Notion schema 检查结果。验证 `/health`、单条文本导入、`/api/jobs/{id}`、Notion 页面链接、问答和 ZIP。设置 Render 错误告警、Postgres 备份、R2 用量告警和模型账户预算。

如果今后愿意使用 Git 仓库，也可从 `render.yaml` 创建 Blueprint，自动建立服务和 Postgres；当前未要求此路径。

成本估算：固定成本为 Web + Worker + Postgres 套餐；变量成本为对象存储 GB 月、请求数、模型输入/输出 token、OCR 图像页数和带宽。`usage_monthly` 记录模型调用次数，`MAX_MONTHLY_AI_CALLS` 限制调用次数，不能代替金额上限。先在各平台设置低预算并按账单校核。价格参考 [Render](https://render.com/pricing) 和 [R2](https://developers.cloudflare.com/r2/pricing/)，部署前复核当前价格。

当前缺少填写完成的 `.env` 和云端容器仓库/Render 授权，因此没有推送镜像或上线。
