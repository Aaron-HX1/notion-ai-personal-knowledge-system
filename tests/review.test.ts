import {it,expect} from 'vitest';
import {Importer} from '../src/importer.js';
import {createWeeklyReview,priorityFor,REVIEW_STATUSES} from '../src/review.js';
import {notifyDueReviews,notifyScore} from '../src/notifications.js';

it('writes 10/8/6 Notion scoring properties then creates a score-descending weekly review',async()=>{
 const notionPages:any[]=[],resources:any[]=[],aDate=new Date('2026-10-29T06:00:00.000Z');
 const db={query:async(sql:string,p:any[]=[])=>{
  if(sql.startsWith('SELECT * FROM resources'))return {rowCount:0,rows:[]};
  if(sql.startsWith('INSERT INTO resources')){const [id,url,source,fingerprint,title,type,category,tags,summary,body,source_name,attachment_key,score,priority_level,reminder_date,review_status,user_note]=p;resources.push({notion_id:id,notion_url:url,title,score,priority_level,reminder_date,review_status,user_note,summary,body,score_updated_at:aDate});return {rowCount:1,rows:[]};}
  if(sql.includes('FROM resources WHERE (score_updated_at'))return {rowCount:resources.length,rows:[...resources].sort((a,b)=>b.score-a.score)};
  if(sql.startsWith('INSERT INTO weekly_reviews'))return {rowCount:1,rows:[]};
  return {rowCount:0,rows:[]};
 }} as any;
 const notion={query:async function*(){},create:async(_ds:string,properties:any)=>{const page={id:`resource-${properties.Score.number}`,url:`https://notion.so/${properties.Score.number}`,properties};notionPages.push(page);return page;},append:async()=>{},update:async()=>{}} as any;
 const ai={classify:async(x:any)=>({title:x.title,type:x.type,category:'其他',tags:[],summary:`摘要 ${x.title}`,key_points:[],use_cases:[],technologies:[],source_name:'测试',confidence:.9,evidence:[],suggested_collection:null}),synthesize:async()=> '模拟模式'} as any;
 const importer=new Importer({NOTION_KNOWLEDGE_DATA_SOURCE_ID:'ds',DATABASE_URL:'mock'} as any,db,notion,ai,{} as any);
 for(const score of [6,10,8])await importer.run({kind:'text',title:`资料${score}`,body:`唯一正文${score}`,score,user_note:`亮点${score}`});
 expect(notionPages.map(p=>[p.properties.Score.number,p.properties['Priority Level'].select.name])).toEqual([[6,'📌 P2-普通参考'],[10,'🔥 P0-极高优 (必看/核心)'],[8,'⭐ P1-重点关注']]);
 expect(notionPages[1].properties['Reminder Date'].date.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
 expect(notionPages[2].properties['Reminder Date'].date).toBeNull();
 const report=await createWeeklyReview({} as any,db,ai,aDate);
 expect(report.items.map((x:any)=>x.score)).toEqual([10,8,6]);
 expect(report.items.map((x:any)=>x.priority_level)).toEqual(['🔥 P0-极高优 (必看/核心)','⭐ P1-重点关注','📌 P2-普通参考']);
 expect(report.report.indexOf('资料10')).toBeLessThan(report.report.indexOf('资料8'));
 expect(report.report.indexOf('资料8')).toBeLessThan(report.report.indexOf('资料6'));
 expect(REVIEW_STATUSES).toContain('待复盘 (Pending)');
});

it('notifies for scores of 8 or more and sends due macOS reminders once',async()=>{
 const sent:any[]=[],updates:any[]=[];const db={query:async(sql:string,p:any[]=[])=>{if(sql.startsWith('SELECT notion_id,title,score'))return {rows:[{notion_id:'due-id',title:'到期资料',score:9}]};if(sql.startsWith('UPDATE resources SET review_notified_at'))updates.push(p[0]);return {rows:[],rowCount:1};}} as any;
 const send=async(title:string,message:string)=>{sent.push([title,message]);return true;};
 expect(await notifyScore({DATABASE_URL:'local'} as any,7,'低分',send)).toBe(false);
 expect(await notifyScore({DATABASE_URL:'local'} as any,8,'重点',send)).toBe(true);
 expect(await notifyDueReviews({DATABASE_URL:'local'} as any,db,'darwin',send)).toEqual({sent:1});
 expect(sent).toHaveLength(2);expect(updates).toEqual(['due-id']);
});

it('validates priority score bounds and maps every tier',()=>{
 expect([1,4,5,6,7,8,9,10].map(priorityFor)).toEqual(['💤 P3-低优归档','💤 P3-低优归档','📌 P2-普通参考','📌 P2-普通参考','⭐ P1-重点关注','⭐ P1-重点关注','🔥 P0-极高优 (必看/核心)','🔥 P0-极高优 (必看/核心)']);
 expect(()=>priorityFor(11)).toThrow('1–10');
});
