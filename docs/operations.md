# 运维、备份与恢复

## 故障排查

启动失败：检查 `loadConfig` 报告的变量、Notion 数据源 ID、集成访问权限和属性类型。429：Notion 层读取 Retry-After 并退避；长时间失败查看后台任务 `error`。403/404：先核对集成是否共享至三个数据库。AI 超时：任务自动重试，检查月配额和模型权限。OCR 失败：检查视觉模型、图片 MIME/尺寸；模拟模式不执行 OCR。导出 404：确认任务完成，且完成时间在 24 小时内。

## 备份

定期从 Notion 导出三个数据库。本地模式先停止服务，再备份 `LOCAL_DATA_DIR/pglite` 与 `LOCAL_STORAGE_DIR`；若附件目录设在 iCloud Drive，也应确认云端同步完成并保留独立副本。云端模式使用 Postgres 逻辑备份（`pg_dump`）和私有桶版本或副本。`.env` 中的密钥需单独安全保存，不进入资料包。验证恢复时先使用隔离的测试环境，不对生产数据库直接覆盖。

## 恢复

1. 在隔离环境恢复 Postgres SQL dump 与对象文件。若继续使用原 Notion 空间和数据源 ID，可保留数据库里的页面引用；若改用新空间，应先导入 Notion 内容或 ZIP，再重建索引，不可直接信任旧页面 URL。
2. 配置新的集成权限、三个 data source ID 和 Secrets。
3. 运行迁移与 schema 检查，再抽样检查资源页面 URL、附件对象和已完成导出任务。
4. 若只有 ZIP，调用 `/api/import/archive` 逐个导回；ZIP 包含已保存的附件，但不能替代 Notion 与数据库的完整备份。
5. 对 Notion 手工改动执行 `/api/index/rebuild`；Worker 每日重建一次索引；如需立即同步，手动调用 `/api/index/rebuild`。
