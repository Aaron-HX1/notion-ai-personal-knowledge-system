import type {DB} from './db.js';
import type {AI} from './ai.js';
export type AskScope={category?:string;tags?:string[]};
export async function ask(db:DB,ai:AI,question:string,scope:AskScope={}){
 const base=question.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[];
 const words=[...new Set(base.flatMap(w=>/^[\p{Script=Han}]+$/u.test(w)&&w.length>3?[w,...Array.from({length:w.length-1},(_,i)=>w.slice(i,i+2))]:[w]))].slice(0,30);
 const rows=(await db.query('SELECT notion_id,notion_url,title,summary,body,tags,category FROM resources ORDER BY updated_at DESC LIMIT 1000')).rows
  .filter(r=>(!scope.category||r.category===scope.category)&&(!scope.tags?.length||scope.tags.every(t=>(r.tags||[]).includes(t))))
  .map(r=>({...r,score:words.reduce((n,w)=>n+(r.title.toLowerCase().includes(w)?5:0)+((r.tags||[]).join(' ').toLowerCase().includes(w)?3:0)+(r.summary.toLowerCase().includes(w)?2:0)+(r.body.toLowerCase().includes(w)?1:0),0)}))
  .filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,8);
 if(!rows.length)return {answer:'现有知识库资料不足以确定。缺少与问题或筛选范围相关的资料。',citations:[]};
 const evidence=rows.map((r,i)=>`[${i+1}] ${r.title}\n${r.body.slice(0,3000)}`).join('\n\n');
 const answer=await ai.synthesize('请用中文回答，并在每个重要结论后使用 [编号] 引用。只使用编号对应的证据。',`问题: ${question}\n证据:\n${evidence}`);
 const used=[...answer.matchAll(/\[(\d+)\]/g)].map(m=>Number(m[1]));
 if(used.some(i=>i<1||i>rows.length))return {answer:'现有知识库资料不足以确定。模型给出了无法核验的引用。',citations:[]};
 const citations=[...new Set(used)].filter(i=>i>=1&&i<=rows.length).map(i=>({number:i,title:rows[i-1].title,notion_url:rows[i-1].notion_url,excerpt:rows[i-1].body.slice(0,500),resource_id:rows[i-1].notion_id}));
 return {answer:citations.length?answer:'现有知识库资料不足以确定。模型未提供可验证引用。',citations};
}
