import {randomUUID} from 'node:crypto';
import type {Config} from './config.js';
import type {DB} from './db.js';
import type {AI} from './ai.js';

export const PRIORITY_LEVELS=[
 {name:'🔥 P0-极高优 (必看/核心)',min:9,max:10},
 {name:'⭐ P1-重点关注',min:7,max:8},
 {name:'📌 P2-普通参考',min:5,max:6},
 {name:'💤 P3-低优归档',min:1,max:4},
] as const;
export const REVIEW_STATUSES=['待复盘 (Pending)','已复盘 (Reviewed)','已搁置 (Archived)'] as const;
export type ReviewStatus=typeof REVIEW_STATUSES[number];
export function priorityFor(score:number){if(!Number.isInteger(score)||score<1||score>10)throw new Error('评分必须是 1–10 的整数');return PRIORITY_LEVELS.find(x=>score>=x.min&&score<=x.max)!.name;}
export function dateKey(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function nextWeekendDate(now=new Date()){const day=now.getDay(),days=(6-day+7)%7;const d=new Date(now);d.setDate(d.getDate()+days);return dateKey(d);}
export function weekStart(date=new Date()){const [y,m,d]=dateKey(date).split('-').map(Number),start=new Date(Date.UTC(y,m-1,d));start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));return start.toISOString().slice(0,10);}
const fallback=(r:any)=>String(r.summary||r.user_note||r.body||'尚无摘要或备注。').replace(/\s+/g,' ').slice(0,420);
const jsonObject=(s:string)=>{const raw=s.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');return JSON.parse(raw);};
export async function createWeeklyReview(c:Config,db:DB,ai:AI,asOf=new Date()){
 const start=weekStart(asOf),end=dateKey(asOf);
 const rows=(await db.query(`SELECT notion_id,notion_url,title,score,priority_level,reminder_date,review_status,user_note,summary,body,score_updated_at
 FROM resources WHERE (score_updated_at >= $1::date AND score_updated_at < ($2::date + interval '1 day'))
 OR (reminder_date <= $2::date AND review_status=$3) ORDER BY score DESC NULLS LAST, score_updated_at DESC NULLS LAST, title LIMIT 100`,[start,end,REVIEW_STATUSES[0]])).rows;
 const items=rows.filter(r=>Number.isInteger(Number(r.score))&&Number(r.score)>=1&&Number(r.score)<=10).map((r:any,index:number)=>({...r,score:Number(r.score),number:index+1,priority_level:r.priority_level||priorityFor(Number(r.score))}));
 let enhanced=new Map<string,any>();
 if(items.length){
  const evidence=items.map((r:any)=>JSON.stringify({id:r.notion_id,score:r.score,priority:r.priority_level,title:r.title,summary:r.summary,user_note:r.user_note,body_excerpt:String(r.body||'').slice(0,1200),notion_url:r.notion_url})).join('\n');
  try{const raw=await ai.synthesize('根据下面 JSONL 资料生成一个严格合法的 JSON 对象，不要 Markdown。结构为 {"items":[{"id":"必须原样对应输入 id","analysis":"...","key_points":["..."],"next_step":"..."}] }。每条资料都要输出。9-10 分写深入拆解，7-8 分写要点速览，6 分及以下写一句话精简；仅使用资料证据，不新增事实或链接。',evidence,false);const parsed=jsonObject(raw);if(Array.isArray(parsed.items))enhanced=new Map(parsed.items.filter((x:any)=>items.some((r:any)=>r.notion_id===x.id)).map((x:any)=>[x.id,x]));}catch{/* malformed or unavailable AI output falls back to source-grounded text */}
 }
 const lines=[`# 周末复盘报告（${start} 至 ${end}）`,'',`本周评分或到期资料：${items.length} 条。按用户评分由高至低排列。`,''];
 const groups=[{title:'🔥 9–10 分项目深度拆解',rows:items.filter((r:any)=>r.score>=9)},{title:'⭐ 7–8 分要点速览',rows:items.filter((r:any)=>r.score>=7&&r.score<=8)},{title:'📌 6 分及以下一句话精简',rows:items.filter((r:any)=>r.score<=6)}];
 for(const group of groups){lines.push(`## ${group.title}`,'');if(!group.rows.length){lines.push('本周暂无。','');continue;}for(const r of group.rows){const a=enhanced.get(r.notion_id);lines.push(`### ${r.number}. ${r.title}（${r.score} 分｜${r.priority_level}）`);if(r.score>=9){lines.push(`- 深度拆解：${a?.analysis||fallback(r)}`,`- 关键要点：${Array.isArray(a?.key_points)&&a.key_points.length?a.key_points.join('；'):fallback(r)}`,`- 建议下一步：${a?.next_step||'结合原文确认适用场景，并决定是否纳入专题。'}`);}else if(r.score>=7){lines.push(`- 要点速览：${a?.analysis||fallback(r)}`,`- 下一步：${a?.next_step||'按需补充到相关专题。'}`);}else lines.push(`- ${a?.analysis||fallback(r)}`);if(r.user_note)lines.push(`- 亮点备注：${r.user_note}`);lines.push(`- 来源：[${r.title}](${r.notion_url})`,'');}}
 lines.push('## 本周资料汇总','','| 名称 | 评分 | 级别 | 亮点 | Notion 链接 |','|---|---:|---|---|---|');
 for(const r of items)lines.push(`| ${String(r.title).replaceAll('|','\\|')} | ${r.score} | ${r.priority_level} | ${fallback(r).replaceAll('|','\\|')} | [打开](${r.notion_url}) |`);
 const report=lines.join('\n'),id=randomUUID();await db.query('INSERT INTO weekly_reviews(id,week_start,report,resources) VALUES($1,$2,$3,$4)',[id,start,report,JSON.stringify(items.map((r:any)=>({id:r.notion_id,title:r.title,score:r.score,priority_level:r.priority_level,notion_url:r.notion_url,user_note:r.user_note,summary:r.summary,body:r.body,review_status:r.review_status}))) ]);
 return {id,week_start:start,week_end:end,report,items:items.map((r:any)=>({id:r.notion_id,title:r.title,score:r.score,priority_level:r.priority_level,notion_url:r.notion_url,user_note:r.user_note,review_status:r.review_status})),ai_enhanced:enhanced.size>0};
}
