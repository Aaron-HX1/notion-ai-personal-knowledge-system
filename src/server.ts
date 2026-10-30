import {notionParentId} from './notion-parent.js';
import {resourceSorts,validateUndo} from './resource-operations.js';
import {lazyDatabase} from './lazy-db.js';
import {SnapshotCache} from './ui-cache.js';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {maskedSecrets,persistConfiguration,secretKeys,hasSavedSecret} from './config-store.js';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {z} from 'zod';
import {loadConfig,effectiveProvider,textModel,reasoningModel,providerKey,type Config} from './config.js';
import {database,enqueue} from './db.js';
import {migrate} from './schema.js';

import {Notion,rt,rtParts,rich,title} from './notion.js';
import {AI} from './ai.js';
import {makeProvider} from './llm-provider.js';
import {mapPool} from './concurrency.js';
import {Storage} from './storage.js';
import type {Importer as ImporterType} from './importer.js';
import {ask} from './retrieval.js';
import {importArchive} from './archive.js';
import {safeUrl,authorized,exportDownloadAvailable} from './security.js';
import {rebuildIndex} from './sync.js';
import {safeError} from './redact.js';
import {hasUiSession,sameLocalOrigin,uiSessionFor} from './ui-auth.js';
import {icloudAvailable,icloudSuggestion,prepareStorageDirectory,saveLocalSettings} from './local-settings.js';
import {priorityFor,REVIEW_STATUSES,createWeeklyReview} from './review.js';
import {notifyScore} from './notifications.js';

const c=loadConfig();
const localDB=lazyDatabase(async()=>{const connection=await database(c);try{if(c.DATABASE_URL==='local')await migrate(connection);await connection.query('SELECT 1');return connection;}catch(e){await connection.end();throw e;}});
const db=localDB.db;
const notion=new Notion(c);
const ai=new AI(c,db);
const storage=new Storage(c);
let importerValue:ImporterType|undefined;
const importer={run:async(...args:Parameters<ImporterType['run']>)=>{const {Importer}=await import('./importer.js');importerValue??=new Importer(c,db,notion,ai,storage);return importerValue.run(...args);}};
const bootState={notion:'initializing',error:''};
let icloudReady=false;

const app=Fastify({logger:{redact:['req.headers.authorization','req.headers.cookie','req.body','res.body'],level:'info'},bodyLimit:1_000_000});
await app.register(rateLimit,{max:90,timeWindow:'1 minute'});
await app.register(multipart,{limits:{fileSize:100_000_000,files:1}});
let shuttingDown=false;
const uiSession=uiSessionFor(c.API_TOKEN);
const deployGuideText=await readFile(new URL('../DEPLOY_GUIDE.md',import.meta.url),'utf8');
const guideText=await readFile(new URL('../docs/USER_GUIDE.md',import.meta.url),'utf8');
const assets={
  '/':{name:'index.html',type:'text/html; charset=utf-8'},
  '/app.js':{name:'app.js',type:'text/javascript; charset=utf-8'},
  '/trend-chart.js':{name:'trend-chart.js',type:'text/javascript; charset=utf-8'},
  '/guide-assets/setup-flow.svg':{name:'guide-assets/setup-flow.svg',type:'image/svg+xml'},
  '/guide-assets/notion-setup.svg':{name:'guide-assets/notion-setup.svg',type:'image/svg+xml'},
  '/guide-assets/config-example.svg':{name:'guide-assets/config-example.svg',type:'image/svg+xml'},
  '/markdown.js':{name:'markdown.js',type:'text/javascript; charset=utf-8'},
  '/styles.css':{name:'styles.css',type:'text/css; charset=utf-8'},
  '/manifest.webmanifest':{name:'manifest.webmanifest',type:'application/manifest+json'},
  '/icon.svg':{name:'icon.svg',type:'image/svg+xml'},
  '/icons.svg':{name:'icons.svg',type:'image/svg+xml'}
} as const;
const assetBodies=new Map<string,Buffer>();
for(const [path,asset] of Object.entries(assets))assetBodies.set(path,await readFile(new URL(`../public/${asset.name}`,import.meta.url)));

const css=assetBodies.get('/styles.css')!.toString();
const themeScript="try{document.documentElement.dataset.theme=localStorage.getItem('kb-theme')||'light'}catch{}";
const hash=(value:string)=>"'sha256-"+createHash('sha256').update(value).digest('base64')+"'";
let notionParentUrl='https://www.notion.so/';try{if(c.NOTION_PARENT_PAGE_URL)notionParentUrl='https://www.notion.so/'+notionParentId(c.NOTION_PARENT_PAGE_URL);}catch{}
const inlineHtml=assetBodies.get('/')!.toString().replace('<link rel="stylesheet" href="/styles.css">',`<script>${themeScript}</script><style>${css}</style>`).replace('<body>',`<body>${assetBodies.get('/icons.svg')!.toString().replace('<svg ','<svg class="icon-sprite" width="0" height="0" aria-hidden="true" ' )}`).replaceAll('/icons.svg#','#').replace('__NOTION_PARENT_URL__',notionParentUrl);
assetBodies.set('/',Buffer.from(inlineHtml));
const assetTags=new Map([...assetBodies].map(([path,bytes])=>[path,'"'+createHash('sha256').update(bytes).digest('hex').slice(0,20)+'"']));
const homeCache=new SnapshotCache<any>({system:{resource_count:0,jobs:{}},resources:{resources:[]},jobs:{jobs:[]},collections:{collections:[]},initialized:false},c.DATABASE_URL==='local'?resolve(c.LOCAL_DATA_DIR,'ui-home.json'):undefined);
const collectionCache=new SnapshotCache<any>({collections:[]},c.DATABASE_URL==='local'?resolve(c.LOCAL_DATA_DIR,'ui-collections.json'):undefined);
async function refreshHome(){return homeCache.refresh(async()=>{
 const [count,jobs,recent,activity]=await Promise.all([db.query('SELECT COUNT(*)::int AS count FROM resources'),db.query('SELECT status,COUNT(*)::int AS count FROM jobs GROUP BY status'),db.query('SELECT notion_id,notion_url,title,category,type FROM resources ORDER BY updated_at DESC LIMIT 4'),db.query('SELECT id,kind,status,created_at FROM jobs ORDER BY created_at DESC LIMIT 4')]);
 return {system:{resource_count:Number(count.rows[0]?.count||0),jobs:Object.fromEntries(jobs.rows.map(r=>[r.status,Number(r.count)]))},resources:{resources:recent.rows},jobs:{jobs:activity.rows},collections:collectionCache.value,initialized:true};
 });}
async function refreshCollections(){return collectionCache.refresh(async()=>{const collections=[];for await(const p of notion.query(c.NOTION_COLLECTIONS_DATA_SOURCE_ID))collections.push({id:p.id,url:p.url,title:title(p),description:rich(p,'Description'),summary:rich(p,'Topic Summary'),status:p.properties?.Status?.select?.name||'',sharing_status:p.properties?.['Sharing Status']?.select?.name||'',resource_ids:p.properties?.['Related Resources']?.relation?.map((x:any)=>x.id)||[]});return {collections};},30000);}

app.addHook('onRequest',async(req,reply)=>{
  const path=req.url.split('?')[0];
  if(path==='/health'||path==='/api/storage/download'||path in assets)return;
  if(authorized(req.headers.authorization,c.API_TOKEN))return;
  const local=c.DATABASE_URL==='local'&&req.ip==='127.0.0.1';
  const uiOk=local&&hasUiSession(req.headers.cookie,uiSession);
  const methodOk=['GET','HEAD'].includes(req.method)||sameLocalOrigin(req.headers.origin,c.PORT);
  if(uiOk&&methodOk)return;
  return reply.code(401).send({error:'本地控制台会话已过期或无效，请刷新页面后重试。Notion Token 和 AI 密钥请在设置页配置。',code:'ui_session_expired'});
});
app.setErrorHandler((unknownError,req,reply)=>{
  const error=unknownError as Error & {statusCode?:number;code?:string};
  req.log.error({code:error.code,status:error.statusCode},'request failed');
  reply.code(error.statusCode&&error.statusCode>=400?error.statusCode:400).send({error:safeError(error,c)});
});

for(const [path,asset] of Object.entries(assets))app.get(path,async(_req,reply)=>{
  if(c.DATABASE_URL!=='local')return reply.code(404).send({error:'本地图形界面仅在本地模式可用'});
  reply.header('Content-Type',asset.type)
    .header('X-Content-Type-Options','nosniff')
    .header('Referrer-Policy','no-referrer')
    .header('Content-Security-Policy',`default-src 'self'; script-src 'self' ${hash(themeScript)}; style-src 'self' ${hash(css)}; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'`);
  reply.header('Cache-Control','private, no-cache').header('ETag',assetTags.get(path)!);
  if(path==='/')reply.header('Set-Cookie',`kb_session=${uiSession}; HttpOnly; SameSite=Strict; Path=/`);
  if(_req.headers['if-none-match']===assetTags.get(path))return reply.code(304).send();
  return reply.send(assetBodies.get(path));
});
app.get('/health',async()=>({ok:!shuttingDown,service:'knowledgebot'}));
app.get('/api/status',async()=>({database:localDB.state.phase,notion:bootState.notion,error:bootState.error}));
app.get('/api/home',async()=>{void refreshHome().catch(()=>{});return {...homeCache.value,collections:collectionCache.value,notion:bootState.notion,initializing:['idle','initializing'].includes(localDB.state.phase),error:bootState.error};});
app.get('/api/storage/download',async(req,reply)=>{
  const q=z.object({key:z.string(),expires:z.coerce.number().int(),sig:z.string()}).parse(req.query);
  if(!storage.verify(q.key,q.expires,q.sig))return reply.code(403).send({error:'下载链接无效或过期'});
  try{const bytes=await storage.get(q.key);return reply.header('Content-Type','application/zip').header('Content-Disposition','attachment; filename=collection.zip').send(bytes);}
  catch{return reply.code(404).send({error:'文件不存在'});}
});

app.get('/api/guide',async(req)=>({markdown:(String((req.query as any).kind)==='deploy'?deployGuideText:guideText).replaceAll('](public/guide-assets/','](/guide-assets/')}));
app.get('/api/system',async()=>{void refreshHome().catch(()=>{});return {...homeCache.value.system,mode:c.DATABASE_URL==='local'?'local':'cloud',storage:c.STORAGE_BACKEND,mock_ai:effectiveProvider(c)==='mock',local_storage_dir:c.STORAGE_BACKEND==='local'?c.LOCAL_STORAGE_DIR:null};});
app.get('/api/settings',async()=>({
  secrets:maskedSecrets(c),persistence:{env:true,backup:true},provider:effectiveProvider(c),model:textModel(c),reasoning_model:reasoningModel(c),base_url:c.AI_BASE_URL||(effectiveProvider(c)==='deepseek'?'https://api.deepseek.com':''),
  openai_key_configured:hasSavedSecret(c.OPENAI_API_KEY),deepseek_key_configured:hasSavedSecret(c.DEEPSEEK_API_KEY),custom_key_configured:hasSavedSecret(c.AI_API_KEY),ocr_key_configured:hasSavedSecret(c.OCR_API_KEY),notion_token_configured:hasSavedSecret(c.NOTION_TOKEN),
  ocr_engine:c.OCR_ENGINE,ocr_base_url:c.OCR_BASE_URL||'',ocr_model:c.OCR_MODEL,
  mock_ai:c.MOCK_AI,storage_dir:c.LOCAL_STORAGE_DIR,icloud_suggested:icloudSuggestion(),icloud_available:icloudReady,notion_configured:true
}));
app.post('/api/settings',async(req)=>{
  if(c.DATABASE_URL!=='local'||c.STORAGE_BACKEND!=='local')throw new Error('设置页仅支持本地模式');
  const x=z.object({provider:z.enum(['mock','openai','deepseek','custom']).optional(),model:z.string().max(120).optional(),reasoning_model:z.string().max(120).optional(),base_url:z.union([z.string().url(),z.literal('')]).optional(),
    api_token:z.string().min(24).max(500).optional(),openai_api_key:z.string().max(500).optional(),deepseek_api_key:z.string().max(500).optional(),ai_api_key:z.string().max(500).optional(),notion_token:z.string().max(500).optional(),
    ocr_engine:z.enum(['auto','local','openai','custom','off']).optional(),ocr_base_url:z.union([z.string().url(),z.literal('')]).optional(),ocr_api_key:z.string().max(500).optional(),ocr_model:z.string().min(1).max(120).optional(),
    mock_ai:z.boolean().optional(),storage_dir:z.string().min(1).max(2000).optional()}).parse(req.body);
  const updates:any={};
  const provider=x.provider||(x.mock_ai===true?'mock':x.mock_ai===false?'openai':undefined);
  if(provider){updates.AI_PROVIDER=provider;updates.MOCK_AI=provider==='mock';}
  if(x.model!==undefined)updates.AI_MODEL=x.model;
  if(x.reasoning_model!==undefined)updates.AI_REASONING_MODEL=x.reasoning_model;
  if(x.base_url!==undefined)updates.AI_BASE_URL=x.base_url;
  if(x.ocr_engine)updates.OCR_ENGINE=x.ocr_engine;
  if(x.ocr_base_url!==undefined)updates.OCR_BASE_URL=x.ocr_base_url;
  if(x.ocr_model)updates.OCR_MODEL=x.ocr_model;
  for(const [field,env] of [['api_token','API_TOKEN'],['openai_api_key','OPENAI_API_KEY'],['deepseek_api_key','DEEPSEEK_API_KEY'],['ai_api_key','AI_API_KEY'],['ocr_api_key','OCR_API_KEY'],['notion_token','NOTION_TOKEN']] as const){const value=x[field]?.trim();if(value)updates[env]=value;}
  if(provider==='deepseek'&&x.base_url===undefined)updates.AI_BASE_URL='https://api.deepseek.com';
  if(provider==='deepseek'&&x.model===undefined)updates.AI_MODEL='deepseek-flash';
  if(provider==='deepseek'&&x.reasoning_model===undefined)updates.AI_REASONING_MODEL='deepseek-v4-pro';
  const directory=x.storage_dir&&x.storage_dir!==c.LOCAL_STORAGE_DIR?await prepareStorageDirectory(c.LOCAL_STORAGE_DIR,x.storage_dir):undefined;
  if(directory)updates.LOCAL_STORAGE_DIR=directory;
  const draft={...c,...updates} as Config;
  if(effectiveProvider(draft)==='custom'&&!draft.AI_MODEL)throw new Error('自定义接口请填写文本模型名称');
  if(effectiveProvider(draft)!=='mock')makeProvider(draft);
  if(updates.NOTION_TOKEN)await new Notion(draft).validate(true);
  await saveLocalSettings(c,updates);
  return {saved:true,provider:effectiveProvider(c),model:textModel(c),key_configured:!!providerKey(c),storage_dir:c.LOCAL_STORAGE_DIR};
});
app.post('/api/settings/delete-secret',async(req)=>{
  if(c.DATABASE_URL!=='local')throw new Error('仅本地模式可删除密钥');
  const {key,confirm}=z.object({key:z.enum(secretKeys),confirm:z.literal('DELETE')}).parse(req.body);
  persistConfiguration(c,{},'.env',[key]);
  (c as any)[key]='';process.env[key]='';
  return {deleted:true,key,restart_requires_setup:key==='NOTION_TOKEN'||key==='API_TOKEN'};
});
app.get('/api/settings/notion-test',async()=>{await notion.validate(true);return {ok:true,message:'Notion 数据源和权限验证成功'};});
app.get('/api/settings/ai-test',async()=>ai.testConnection());
app.get('/api/settings/quota',async(_req,reply)=>{
 const provider=effectiveProvider(c);
 if(provider!=='deepseek')return {provider,balances:null,monthly_usage:null,message:provider==='mock'?'模拟模式不消耗模型额度':'当前提供商未配置余额查询接口，请到提供商控制台查看'};
 const key=providerKey(c);if(!key)return reply.code(400).send({error:'请先在设置中填写并保存 DeepSeek API Key'});
 try{
  const response=await fetch('https://api.deepseek.com/user/balance',{headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)return reply.code(502).send({error:response.status===401?'DeepSeek 密钥无效，请在设置中检查':`DeepSeek 余额查询失败（HTTP ${response.status}）`});
  const data=z.object({is_available:z.boolean(),balance_infos:z.array(z.object({currency:z.string(),total_balance:z.string(),granted_balance:z.string(),topped_up_balance:z.string()}))}).parse(await response.json());
  return {provider,available:data.is_available,balances:data.balance_infos,monthly_usage:null,message:'本月消费请在 DeepSeek 控制台查看'};
 }catch{return reply.code(502).send({error:'DeepSeek 余额查询失败或超时，请检查网络并重试'});}
});
app.post('/api/system/stop',async(req,reply)=>{if(c.DATABASE_URL!=='local')throw new Error('仅本地模式可停止');const running=await db.query("SELECT COUNT(*)::int AS count FROM jobs WHERE status='running'");if(Number(running.rows[0]?.count)>0)return reply.code(409).send({error:'仍有任务运行，请完成后再停止服务'});shuttingDown=true;setTimeout(()=>void app.close().then(()=>process.exit(0)),150);return {stopping:true};});
app.get('/api/jobs',async(req)=>{
  const q=z.object({limit:z.coerce.number().int().min(1).max(100).default(30)}).parse(req.query);
  const r=await db.query('SELECT id,kind,status,stage,stage_updated_at,result,error,retries,created_at,completed_at FROM jobs ORDER BY created_at DESC LIMIT $1',[q.limit]);
  return {jobs:r.rows};
});
app.post('/api/jobs/:id/retry',async(req:any,reply)=>{
  const id=z.string().uuid().parse(req.params.id);
  const r=await db.query("UPDATE jobs SET status='queued',stage='queued',stage_updated_at=now(),retries=0,error=NULL,run_after=now(),completed_at=NULL WHERE id=$1 AND status='failed' RETURNING id,notion_id",[id]);
  if(!r.rows[0])return reply.code(409).send({error:'任务不存在或当前状态不可重试'});
  if(r.rows[0].notion_id)await notion.update(r.rows[0].notion_id,{Status:{select:{name:'queued'}},'Error Message':{rich_text:[]},'Retry Count':{number:0}}).catch(()=>{});
  return {job_id:id,status:'queued'};
});
app.get('/api/jobs/:id',async(req:any,reply)=>{
  const r=await db.query('SELECT id,kind,status,stage,stage_updated_at,result,error,retries,created_at,completed_at FROM jobs WHERE id=$1',[req.params.id]);
  return r.rows[0]||reply.code(404).send({error:'任务不存在'});
});
app.get('/api/resources',async(req)=>{
 const q=z.object({q:z.string().max(200).default(''),limit:z.coerce.number().int().min(1).max(100).default(30),offset:z.coerce.number().int().min(0).default(0),sort:z.enum(['smart','score_desc','score_asc','newest','oldest']).default('smart'),status:z.enum(['all','pending','completed','archived']).default('all'),category:z.string().max(100).default(''),tag:z.string().max(100).default('')}).parse(req.query);
 const order=resourceSorts[q.sort];
 const r=await db.query(`SELECT notion_id,notion_url,title,type,category,tags,summary,source_url,source_name,updated_at,imported_at,score,review_status,learning_status FROM resources WHERE ($1='' OR title ILIKE '%'||$1||'%' OR summary ILIKE '%'||$1||'%' OR body ILIKE '%'||$1||'%') AND ($4='' OR category=$4) AND ($5='' OR $5=ANY(tags)) AND ($6='all' OR ($6='pending' AND (review_status IS NULL OR review_status='待复盘 (Pending)')) OR ($6='completed' AND learning_status IN ('已学习','已部署')) OR ($6='archived' AND review_status='已搁置 (Archived)')) ORDER BY ${order},notion_id LIMIT $2 OFFSET $3`,[q.q.trim(),q.limit,q.offset,q.category,q.tag,q.status]);
 return {resources:r.rows,limit:q.limit,offset:q.offset};
});
app.get('/api/resource-filters',async()=>{const r=await db.query('SELECT DISTINCT category,tags FROM resources ORDER BY category');return {categories:[...new Set(r.rows.map(x=>x.category).filter(Boolean))],tags:[...new Set(r.rows.flatMap(x=>x.tags||[]))].sort()};});
app.get('/api/resources/:id',async(req:any,reply)=>{
 const r=await db.query('SELECT notion_id,notion_url,title,type,category,tags,summary,body,source_url,source_name,collection_ids,updated_at,score,review_status,learning_status FROM resources WHERE notion_id=$1',[req.params.id]);
 return r.rows[0]||reply.code(404).send({error:'资料不存在'});
});
async function checkedResource(id:string){const local=await db.query('SELECT * FROM resources WHERE notion_id=$1',[id]);if(!local.rowCount)throw new Error('资料不存在，请先同步');const page=await notion.page(id);if(page.parent?.data_source_id!==c.NOTION_KNOWLEDGE_DATA_SOURCE_ID)throw new Error('目标不是已配置的 Knowledge Base 资料');return {local:local.rows[0],page};}
app.patch('/api/resources/:id/learning',async(req:any)=>{
 const id=z.string().uuid().parse(req.params.id),{status}=z.object({status:z.enum(['待学习','已学习','已部署'])}).parse(req.body);const old=await checkedResource(id);await notion.update(id,{'Learning Status':{select:{name:status}}});
 await db.query('UPDATE resources SET learning_status=$2,updated_at=now() WHERE notion_id=$1',[id,status]);
 if(old.local.learning_status!==status&&status!=='待学习')await db.query('INSERT INTO resource_events(id,resource_id,kind) VALUES($1,$2,$3)',[crypto.randomUUID(),id,status==='已学习'?'learn':'deploy']);
 return {id,status};
});
app.post('/api/resources/:id/archive',async(req:any)=>{const id=z.string().uuid().parse(req.params.id);await checkedResource(id);await notion.update(id,{'Review Status':{select:{name:REVIEW_STATUSES[2]}}});await db.query('UPDATE resources SET review_status=$2,updated_at=now() WHERE notion_id=$1',[id,REVIEW_STATUSES[2]]);return {id,archived:true};});
app.delete('/api/resources/:id',async(req:any,reply)=>{
 const id=z.string().uuid().parse(req.params.id);const {confirm,job_id}=z.object({confirm:z.literal('DELETE'),job_id:z.string().uuid().optional()}).parse(req.body);void confirm;
 const {page}=await checkedResource(id);
 if(job_id){const job=await db.query("SELECT result FROM jobs WHERE id=$1 AND kind='import' AND status='done'",[job_id]);const result=job.rows[0]?.result;const error=validateUndo(result,id,page.last_edited_time);if(error)return reply.code(409).send({error});}
 await notion.call('/pages/'+id,'PATCH',{in_trash:true});await db.query('DELETE FROM resources WHERE notion_id=$1',[id]);void refreshHome().catch(()=>{});return {id,trashed:true};
});
app.get('/api/stats/trends',async(req)=>{const {period}=z.object({period:z.enum(['day','week','month']).default('day')}).parse(req.query);const count=period==='day'?14:period==='week'?12:12;const interval=period==='day'?'13 days':period==='week'?'11 weeks':'11 months';const rows=await db.query(`WITH buckets AS (SELECT generate_series(date_trunc('${period}',now() AT TIME ZONE 'Asia/Shanghai')-interval '${interval}',date_trunc('${period}',now() AT TIME ZONE 'Asia/Shanghai'),interval '1 ${period}')::date AS period), totals AS (SELECT date_trunc('${period}',created_at AT TIME ZONE 'Asia/Shanghai')::date AS period,kind,count(*)::int AS count FROM resource_events GROUP BY 1,2) SELECT buckets.period,kinds.kind,COALESCE(totals.count,0)::int AS count FROM buckets CROSS JOIN (VALUES ('import'),('learn'),('deploy')) AS kinds(kind) LEFT JOIN totals ON totals.period=buckets.period AND totals.kind=kinds.kind ORDER BY buckets.period,kinds.kind`);return {period,count,events:rows.rows,note:'统计从启用此功能后开始记录；历史状态不推测发生时间。'};});
app.get('/api/reviews',async(req)=>{
  const q=z.object({limit:z.coerce.number().int().min(1).max(200).default(100),status:z.enum(REVIEW_STATUSES).optional()}).parse(req.query);
  const rows=await db.query(`SELECT notion_id AS id,notion_url,title,score,priority_level,reminder_date,review_status,user_note,summary,score_updated_at FROM resources WHERE ($2::text IS NULL OR review_status=$2) ORDER BY score DESC NULLS LAST,reminder_date NULLS LAST,title LIMIT $1`,[q.limit,q.status||null]);
  return {resources:rows.rows};
});
app.patch('/api/resources/:id/review',async(req:any,reply)=>{
  const id=z.string().uuid().parse(req.params.id);
  const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{try{return new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}catch{return false;}},'日期无效');
  const x=z.object({score:z.number().int().min(1).max(10),user_note:z.string().max(10000).default(''),reminder_date:z.union([isoDate,z.null()]),review_status:z.enum(REVIEW_STATUSES)}).parse(req.body);
  const old=(await db.query('SELECT notion_id,score FROM resources WHERE notion_id=$1',[id])).rows[0];if(!old)return reply.code(404).send({error:'资料不存在，请先同步 Notion'});
  const page=await notion.page(id);if(page.parent?.data_source_id!==c.NOTION_KNOWLEDGE_DATA_SOURCE_ID)throw new Error('目标不是已配置的 Knowledge Base 资料');
  const level=priorityFor(x.score);
  await notion.update(id,{Score:{number:x.score},'Priority Level':{select:{name:level}},'Reminder Date':{date:x.reminder_date?{start:x.reminder_date}:null},'Review Status':{select:{name:x.review_status}},'User Note':{rich_text:rtParts(x.user_note)}});
  await db.query('UPDATE resources SET score=$2,priority_level=$3,reminder_date=$4,review_status=$5,user_note=$6,score_updated_at=now(),review_notified_at=NULL,updated_at=now() WHERE notion_id=$1',[id,x.score,level,x.reminder_date,x.review_status,x.user_note]);
  if(Number(old.score)!==x.score)await notifyScore(c,x.score,page.properties?.Title?.title?.map((t:any)=>t.plain_text).join('')||'高分资料');
  return {id,score:x.score,priority_level:level,reminder_date:x.reminder_date,review_status:x.review_status,user_note:x.user_note};
});
app.post('/api/reviews/weekly',async()=>createWeeklyReview(c,db,ai));
app.post('/api/reviews/weekly/archive',async(req,reply)=>{
  const {id}=z.object({id:z.string().uuid()}).parse(req.body);const row=(await db.query('SELECT report,resources,archived_collection_id,week_start FROM weekly_reviews WHERE id=$1',[id])).rows[0];if(!row)return reply.code(404).send({error:'复盘报告不存在'});if(row.archived_collection_id)return {id:row.archived_collection_id,already_archived:true};
  const items=typeof row.resources==='string'?JSON.parse(row.resources):row.resources;const blocks=row.report.split(/\r?\n/).filter(Boolean).map((line:string)=>{if(line.startsWith('## '))return {object:'block',type:'heading_2',heading_2:{rich_text:rt(line.slice(3))}};if(line.startsWith('### '))return {object:'block',type:'heading_3',heading_3:{rich_text:rt(line.slice(4))}};return {object:'block',type:'paragraph',paragraph:{rich_text:rt(line)}};});const collection=await notion.create(c.NOTION_COLLECTIONS_DATA_SOURCE_ID,{Title:{title:rt(`周末复盘 ${row.week_start}`)},Description:{rich_text:rt(`KnowledgeBot 周末复盘归档 · ${row.week_start}`)},'Related Resources':{relation:items.slice(0,100).map((x:any)=>({id:x.id}))},'Topic Summary':{rich_text:rtParts(row.report)},'Sharing Status':{select:{name:'私有'}},'Last Reviewed':{date:{start:new Date().toISOString().slice(0,10)}}},blocks);
  await db.query('UPDATE weekly_reviews SET archived_collection_id=$2 WHERE id=$1',[id,collection.id]);return {id:collection.id,url:collection.url,title:`周末复盘 ${row.week_start}`};
});
app.post('/api/reviews/weekly/mark-reviewed',async(req,reply)=>{
  const {id}=z.object({id:z.string().uuid()}).parse(req.body);const row=(await db.query('SELECT resources FROM weekly_reviews WHERE id=$1',[id])).rows[0];if(!row)return reply.code(404).send({error:'复盘报告不存在'});const items=typeof row.resources==='string'?JSON.parse(row.resources):row.resources;let updated=0;
  for(const item of items){const exists=await db.query('SELECT notion_id FROM resources WHERE notion_id=$1',[item.id]);if(!exists.rowCount)continue;await notion.update(item.id,{'Review Status':{select:{name:REVIEW_STATUSES[1]}}});await db.query('UPDATE resources SET review_status=$2,score_updated_at=now(),review_notified_at=NULL,updated_at=now() WHERE notion_id=$1',[item.id,REVIEW_STATUSES[1]]);updated++;}
  return {updated,status:REVIEW_STATUSES[1]};
});
app.get('/api/collections',async()=>{void refreshCollections().catch(()=>{});return {...collectionCache.value,syncing:collectionCache.refreshing};});
app.post('/api/collections',async(req)=>{
  const x=z.object({title:z.string().min(1).max(300),description:z.string().max(2000).default('')}).parse(req.body);
  const p=await notion.create(c.NOTION_COLLECTIONS_DATA_SOURCE_ID,{Title:{title:rt(x.title)},Description:{rich_text:rt(x.description)},Status:{select:{name:'进行中'}},'Sharing Status':{select:{name:'私有'}}});
  collectionCache.value={collections:[...collectionCache.value.collections,{id:p.id,url:p.url,title:x.title,description:x.description,resource_ids:[]}]};return {id:p.id,url:p.url,title:x.title};
});
app.post('/api/collections/:id/resources',async(req:any)=>{
  const id=z.string().uuid().parse(req.params.id);
  const x=z.object({resource_ids:z.array(z.string().uuid()).min(1).max(50)}).parse(req.body);
  const p=await notion.page(id);
  if(p.parent?.data_source_id!==c.NOTION_COLLECTIONS_DATA_SOURCE_ID)throw new Error('目标不是已配置的专题');
  const found=await db.query('SELECT notion_id FROM resources WHERE notion_id=ANY($1::text[])',[x.resource_ids]);
  if(found.rows.length!==new Set(x.resource_ids).size)throw new Error('部分资料不存在于本地索引');
  const ids=[...new Set([...(p.properties?.['Related Resources']?.relation?.map((r:any)=>r.id)||[]),...x.resource_ids])];
  await notion.update(id,{'Related Resources':{relation:ids.map(resourceId=>({id:resourceId}))}});
  const cached=collectionCache.value.collections.find((item:any)=>item.id===id);if(cached)cached.resource_ids=ids;void refreshCollections().catch(()=>{});return {id,resource_ids:ids};
});

const scoreInput={score:z.coerce.number().int().min(1).max(10).optional(),user_note:z.string().max(10000).optional(),reminder:z.boolean().optional()};
const urlInput=z.object({url:z.string().url(),title:z.string().max(500).optional(),body:z.string().max(100000).optional(),duplicate:z.enum(['skip','copy','merge']).optional(),...scoreInput});
async function existingUrl(url:string){const r=await db.query('SELECT notion_id,notion_url FROM resources WHERE source_url=$1 LIMIT 1',[url]);return r.rows[0]?{status:'duplicate',resource_id:r.rows[0].notion_id,notion_url:r.rows[0].notion_url}:null;}
app.post('/api/import/url',async(req)=>{const x=urlInput.parse(req.body);const url=await safeUrl(x.url,c.ALLOW_DNS_PROXY_RANGE);if(x.duplicate!=='copy'){const existing=await existingUrl(url);if(existing)return existing;}return {job_id:await enqueue(db,'import',{kind:'url',...x,url})};});
app.post('/api/import/github',async(req)=>{const x=urlInput.parse(req.body);const url=await safeUrl(x.url,c.ALLOW_DNS_PROXY_RANGE);if(new URL(url).hostname!=='github.com')throw new Error('仅支持 github.com');if(x.duplicate!=='copy'){const existing=await existingUrl(url);if(existing)return existing;}return {job_id:await enqueue(db,'import',{kind:'github',...x,url})};});
app.post('/api/import/text',async(req)=>{const x=z.object({title:z.string().min(1).max(500),body:z.string().min(1).max(100000),duplicate:z.enum(['skip','copy','merge']).optional(),...scoreInput}).parse(req.body);return {job_id:await enqueue(db,'import',{kind:'text',...x})};});
app.post('/api/import/batch',async(req)=>{
  const batch=z.object({items:z.array(z.discriminatedUnion('kind',[z.object({kind:z.literal('url'),url:z.string().url(),title:z.string().optional(),body:z.string().optional()}),z.object({kind:z.literal('github'),url:z.string().url()}),z.object({kind:z.literal('text'),title:z.string(),body:z.string()})])).min(1).max(100),...scoreInput}).parse(req.body);const items=batch.items;
  const prepared=await mapPool(items,4,async x=>x.kind==='url'||x.kind==='github'?{...x,url:await safeUrl(x.url,c.ALLOW_DNS_PROXY_RANGE)}:x);
  const ids=[];const seen=new Set<string>();for(const x of prepared){if('url' in x){if(seen.has(x.url))continue;seen.add(x.url);}ids.push(await enqueue(db,'import',{...x,score:batch.score,user_note:batch.user_note,reminder:batch.reminder}));}return {job_ids:ids};
});
app.post('/api/import/file',async(req)=>{const f=await req.file();if(!f)throw new Error('缺少文件');const name=f.filename.replace(/[\\/]/g,'_');if(!/\.(png|jpe?g|webp|pdf|docx|txt|md)$/i.test(name))throw new Error('文件类型不支持');const bytes=await f.toBuffer();if(bytes.length>c.MAX_FILE_BYTES)throw new Error('文件超过大小限制');const form=f.fields as any,score=form.score?Number(form.score.value):undefined,user_note=form.user_note?.value?String(form.user_note.value):undefined,reminder=form.reminder?.value==='true';if(score!==undefined&&(!Number.isInteger(score)||score<1||score>10))throw new Error('评分必须是 1–10 的整数');const key=`uploads/${crypto.randomUUID()}/${name}`;await storage.put(key,bytes,f.mimetype);return {job_id:await enqueue(db,'import',{kind:'file',name,key,score,user_note,reminder})};});
app.post('/api/import/archive',async(req)=>{const f=await req.file();if(!f||!f.filename.endsWith('.zip'))throw new Error('需要 ZIP 文件');const strategy=z.enum(['skip','copy','merge']).parse((req.query as any)?.duplicate||'skip');return {results:await importArchive(await f.toBuffer(),importer,strategy,storage,db)};});
app.post('/api/ask',async(req)=>{const x=z.object({question:z.string().min(2).max(2000),category:z.string().max(100).optional(),tags:z.array(z.string().max(100)).max(10).optional()}).parse(req.body);return ask(db,ai,x.question,{category:x.category,tags:x.tags});});
app.post('/api/collections/:id/summarize',async(req:any)=>({job_id:await enqueue(db,'summarize',{id:req.params.id})}));
app.post('/api/export/collection',async(req)=>{const x=z.object({id:z.string().uuid()}).parse(req.body);return {job_id:await enqueue(db,'export',x)};});
app.get('/api/export/:jobId/download',async(req:any,reply)=>{const r=await db.query("SELECT result,completed_at FROM jobs WHERE id=$1 AND kind='export' AND status='done'",[req.params.jobId]);if(!r.rows[0]?.result?.key||!exportDownloadAvailable(new Date(r.rows[0].completed_at)))return reply.code(404).send({error:'导出不存在或已过期'});return {url:await storage.signed(r.rows[0].result.key),expires_in:c.DOWNLOAD_TTL_SECONDS};});
app.post('/api/index/rebuild',async()=>rebuildIndex(c,db,notion));

const stopWorker=new AbortController();
let workerPromise:Promise<void>|undefined;
let cacheTimer:ReturnType<typeof setInterval>|undefined;
app.addHook('onClose',async()=>{stopWorker.abort();if(cacheTimer)clearInterval(cacheTimer);await workerPromise;await db.end();});
await app.listen({port:c.PORT,host:c.DATABASE_URL==='local'?'127.0.0.1':'0.0.0.0'});
// Begin local work only after HTTP is listening. No external I/O gates the shell.
setImmediate(()=>{
 void icloudAvailable().then(value=>{icloudReady=value;});
 void (async()=>{await Promise.all([homeCache.load(),collectionCache.load()]);await localDB.ready();await refreshHome();})().catch(e=>{bootState.error=safeError(e,c);});
 cacheTimer=setInterval(()=>{void refreshHome().catch(()=>{});},2000);cacheTimer.unref();
 if(c.DATABASE_URL==='local')workerPromise=(async()=>{
  await localDB.ready();
  while(!stopWorker.signal.aborted){try{await notion.validate();bootState.notion='ready';bootState.error='';void refreshCollections().catch(()=>{});const {runWorker}=await import('./worker-loop.js');await runWorker(c,db,stopWorker.signal);break;}catch(e){bootState.notion='error';bootState.error=safeError(e,c);await new Promise<void>(done=>{const timer=setTimeout(done,30000);stopWorker.signal.addEventListener('abort',()=>{clearTimeout(timer);done();},{once:true});});}}
 })().catch(e=>{bootState.error=safeError(e,c);});
});
if(c.DATABASE_URL==='local'&&process.env.KB_OPEN_BROWSER==='1'){
  const browser=spawn('open',[`http://localhost:${c.PORT}/`],{stdio:'ignore',detached:true});
  browser.unref();
}
