import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
it('includes the requested user guide topics and a GUI entry point',async()=>{
 const guide=await readFile('docs/USER_GUIDE.md','utf8'),html=await readFile('public/index.html','utf8');
 for(const heading of ['三分钟快速上手','导入资料','AI 知识库问答','专题与跨资料综述','ZIP 导出','资料评分与复盘','Notion 端日常配合','常见问题'])expect(guide).toContain(heading);
 expect(html).toContain('📖 使用指南');expect(html).toContain('id="view-guide"');expect(html).toContain('id="view-review"');expect(html).toContain('id="view-weekly"');
 expect(html).toContain('id="import-score"');expect(html).toContain('id="import-reminder"');expect(html).toContain('id="review-list"');expect(html).toContain('id="generate-weekly"');
});
