# Notion 集成与数据源配置

1. 在 Notion 开发者后台创建内部集成，开启读取、插入、更新内容权限。本地用户将令牌填入 `.env` 的 `NOTION_TOKEN`，云端用户使用平台 Secret。新用户优先按根目录 DEPLOY_GUIDE.md 的自动初始化流程操作，无需手工搭建以下字段。
2. 在工作空间创建 Knowledge Base、Collections、AI Jobs 三个数据库。对每个数据库授予集成访问权限。复制其 **data source ID**，不是 view ID，分别填入 `NOTION_*_DATA_SOURCE_ID`。
3. Knowledge Base 创建：Title(title)、Type(select)、Source URL(url)、Category(select)、Tags(multi_select)、Summary(rich_text)、Key Points(rich_text)、Processing Status(select)、Source Name(rich_text)、Related Collections(relation 指向 Collections)、Favorite(checkbox)、Created Time(created_time)、AI Updated Time(date)、Content Fingerprint(rich_text)。启动自检会使用 Notion Update data source API 自动补齐评分复盘字段：Score(number)、Priority Level(select)、Reminder Date(date)、Review Status(select)、User Note(rich_text)，并补齐需要的级别和状态选项。需要集成有 Update content 权限。
4. Collections 创建：Title(title)、Description(rich_text)、Related Resources(relation 指向 Knowledge Base)、Topic Summary(rich_text)、Status(select)、Sharing Status(select)、Last Reviewed(date)。
5. AI Jobs 创建：Title(title)、Job Type(select)、Target Resource(relation 指向 Knowledge Base)、Status(select)、Error Message(rich_text)、Retry Count(number)、Created Time(created_time)、Completed Time(date)。运行状态写入 Postgres，Worker 同步任务状态到 AI Jobs。
6. 给 Type 建立 web/github/text/pdf/docx/image 选项；给 Processing Status 建立 待确认/已完成。Category 建立 README 所列初始分类。必要时调整 Notion select 选项，避免生产运行时自动创建意外选项。
7. 启动服务时会逐项读取数据源属性，自动增加缺失评分字段并验证其余字段；已有同名字段若类型不正确会报出清晰诊断，不会自动转换或删除现有数据。Notion API 版本默认 `2026-03-11`，升级前须重跑集成测试。参考：[Notion API](https://developers.notion.com/reference/intro)。
