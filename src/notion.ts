import type {Config} from './config.js';
import {PRIORITY_LEVELS,REVIEW_STATUSES} from './review.js';
export const required={knowledge:{Title:'title',Type:'select','Source URL':'url',Category:'select',Tags:'multi_select',Summary:'rich_text','Key Points':'rich_text','Processing Status':'select','Source Name':'rich_text','Related Collections':'relation',Favorite:'checkbox','Created Time':'created_time','AI Updated Time':'date','Content Fingerprint':'rich_text',Score:'number','Priority Level':'select','Reminder Date':'date','Review Status':'select','User Note':'rich_text','Learning Status':'select'},collections:{Title:'title',Description:'rich_text','Related Resources':'relation','Topic Summary':'rich_text',Status:'select','Sharing Status':'select','Last Reviewed':'date'},jobs:{Title:'title','Job Type':'select','Target Resource':'relation',Status:'select','Error Message':'rich_text','Retry Count':'number','Created Time':'created_time','Completed Time':'date'}} as const;
export class Notion {
 private static nextSlot=0;
 private static slotQueue:Promise<void>=Promise.resolve();
 private static schemaCache=new Map<string,number>();
 constructor(private c:Config){}
 private async slot(){
  const previous=Notion.slotQueue;let release!:()=>void;
  Notion.slotQueue=new Promise<void>(r=>{release=r});
  await previous;
  const now=Date.now(),start=Math.max(now,Notion.nextSlot);
  Notion.nextSlot=start+350;release();
  if(start>now)await pause(start-now);
 }
 async call(path:string,method='GET',body?:unknown):Promise<any>{
  for(let i=0;i<5;i++){
   await this.slot();let res:Response;
   try{res=await fetch('https://api.notion.com/v1'+path,{method,headers:{Authorization:`Bearer ${this.c.NOTION_TOKEN}`,'Notion-Version':this.c.NOTION_VERSION,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});}
   catch(e){if(i===4||method!=='GET')throw e;await pause(500*2**i);continue;}
   if(res.ok)return res.json();
   const data=await res.json().catch(()=>({}));
   const blocked=data?.additional_data?.rate_limit_reason==='public_api_request_blocked';
   const retryable=!blocked&&(res.status===429||res.status===529||method==='GET'&&[500,502,503,504].includes(res.status));
   if(retryable&&i<4){const header=res.headers.get('retry-after');const seconds=header===null?Math.min(30,2**i):Number(header);await pause((Number.isFinite(seconds)?Math.max(0,seconds):1)*1000+Math.random()*250);continue;}
   throw new Error(`Notion ${res.status}: ${data.code||'request_failed'} ${data.message||''}`);
  }
  throw new Error('Notion retry exhausted');
 }
 async validate(force=false){
  const ids=[['knowledge',this.c.NOTION_KNOWLEDGE_DATA_SOURCE_ID],['collections',this.c.NOTION_COLLECTIONS_DATA_SOURCE_ID],['jobs',this.c.NOTION_JOBS_DATA_SOURCE_ID]] as const;
  const cacheKey=[this.c.NOTION_TOKEN,this.c.NOTION_VERSION,...ids.map(x=>x[1])].join(':');
  if(!force&&(Notion.schemaCache.get(cacheKey)||0)>Date.now())return;
  await this.ensureReviewSchema(ids[0][1]);
  const problems:string[]=[];
  for(const [kind,id] of ids){try{const ds=await this.call('/data_sources/'+id);for(const [name,type] of Object.entries(required[kind]))if(ds.properties?.[name]?.type!==type)problems.push(`${kind}.${name}: 需要 ${type}, 实际 ${ds.properties?.[name]?.type||'缺失'}`);}catch(e){problems.push(`${kind} (${id}): ${String(e)}`);}}
  if(problems.length)throw new Error('Notion 数据源检查失败:\n'+problems.join('\n'));
  Notion.schemaCache.set(cacheKey,Date.now()+5*60_000);
 }
 private async ensureReviewSchema(id:string){
  const data=await this.call('/data_sources/'+id);const current=data.properties||{},additions:Record<string,unknown>={};
  const fixed:Record<string,unknown>={Score:{number:{format:'number'}},'Reminder Date':{date:{}},'User Note':{rich_text:{}}};
  for(const [name,config] of Object.entries(fixed)){const type=Object.keys(config as object)[0];if(!current[name])additions[name]=config;else if(current[name].type!==type)throw new Error(`Notion 数据源属性类型冲突：${name} 应为 ${type}，实际 ${current[name].type}`);}
  const selects=[['Priority Level',PRIORITY_LEVELS.map(x=>x.name)],['Review Status',[...REVIEW_STATUSES]],['Learning Status',['待学习','已学习','已部署']]] as const;
  for(const [name,names] of selects){const found=current[name];if(found&&found.type!=='select')throw new Error(`Notion 数据源属性类型冲突：${name} 应为 select，实际 ${found.type}`);const options=found?.select?.options||[];const merged=[...options,...names.filter(n=>!options.some((x:any)=>x.name===n)).map(name=>({name}))];if(!found||merged.length!==options.length)additions[name]={select:{options:merged}};}
  if(Object.keys(additions).length)await this.call('/data_sources/'+id,'PATCH',{properties:additions});
 }
 async *query(id:string,filter?:unknown){let cursor:string|undefined;do{const r=await this.call(`/data_sources/${id}/query`,'POST',{page_size:100,...(filter?{filter}:{}),...(cursor?{start_cursor:cursor}:{})});for(const item of r.results||[])yield item;cursor=r.has_more?r.next_cursor:undefined;}while(cursor);}
 async page(id:string){return this.call('/pages/'+id);}
 async blocks(id:string){const out:any[]=[];let cursor:string|undefined;do{const r=await this.call(`/blocks/${id}/children${cursor?'?start_cursor='+encodeURIComponent(cursor):''}`);out.push(...r.results);cursor=r.has_more?r.next_cursor:undefined;}while(cursor);return out;}
 async create(ds:string,properties:Record<string,unknown>,children?:unknown[]){const first=children?.slice(0,100);const page=await this.call('/pages','POST',{parent:{type:'data_source_id',data_source_id:ds},properties,...(first?.length?{children:first}:{})});if(children&&children.length>100)await this.append(page.id,children.slice(100));return page;}
 async update(id:string,properties:Record<string,unknown>){return this.call('/pages/'+id,'PATCH',{properties});}
 async append(id:string,children:unknown[]){for(let i=0;i<children.length;i+=100)await this.call(`/blocks/${id}/children`,'PATCH',{children:children.slice(i,i+100)});}
}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export const rt=(s:string)=>[{text:{content:s.slice(0,2000)}}];
export const rtParts=(s:string)=>s.match(/[\s\S]{1,2000}/g)?.map(content=>({type:'text',text:{content}}))||[];
export const rich=(p:any,k:string)=>p?.properties?.[k]?.rich_text?.map((x:any)=>x.plain_text).join('')||'';
export const title=(p:any)=>p?.properties?.Title?.title?.map((x:any)=>x.plain_text).join('')||'';
export function paragraph(s:string){return {object:'block',type:'paragraph',paragraph:{rich_text:rt(s)}};}
