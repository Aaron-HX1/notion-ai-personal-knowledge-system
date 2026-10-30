import {loadPersistentEnvironment,persistConfiguration} from './config-store.js';
import {z} from 'zod';

const optionalUrl=z.preprocess(v=>v===''?undefined:v,z.string().url().refine(v=>['http:','https:'].includes(new URL(v).protocol),'仅支持 HTTP(S)').optional());
const schema=z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'),
 PORT:z.coerce.number().int().positive().default(3000),
 API_TOKEN:z.string().min(24).refine(v=>!v.toLowerCase().includes('replace'),{message:'请设置随机 API_TOKEN'}),
 NOTION_TOKEN:z.string().min(8),
 NOTION_KNOWLEDGE_DATA_SOURCE_ID:z.string().uuid(),
 NOTION_COLLECTIONS_DATA_SOURCE_ID:z.string().uuid(),
 NOTION_JOBS_DATA_SOURCE_ID:z.string().uuid(),
 NOTION_PARENT_PAGE_URL:z.string().max(2000).optional(),
 NOTION_VERSION:z.string().default('2026-03-11'),
 DATABASE_URL:z.string().default('local'),
 LOCAL_DATA_DIR:z.string().default('./data'),
 LOCAL_STORAGE_DIR:z.string().default('./data/storage'),
 STORAGE_BACKEND:z.enum(['local','s3']).default('local'),
 ALLOW_DNS_PROXY_RANGE:z.enum(['true','false']).default('false').transform(x=>x==='true'),
 PUBLIC_BASE_URL:optionalUrl,
 OPENAI_API_KEY:z.string().optional(),
 OPENAI_MODEL:z.string().default('gpt-4.1-mini'),
 AI_PROVIDER:z.enum(['mock','openai','deepseek','custom']).default('openai'),
 AI_BASE_URL:optionalUrl,
 AI_API_KEY:z.string().optional(),
 AI_MODEL:z.string().optional(),
 AI_REASONING_MODEL:z.string().optional(),
 DEEPSEEK_API_KEY:z.string().optional(),
 OCR_ENGINE:z.enum(['auto','local','openai','custom','off']).default('auto'),
 OCR_BASE_URL:optionalUrl,
 OCR_API_KEY:z.string().optional(),
 OCR_MODEL:z.string().default('gpt-4o-mini'),
 CATEGORIES:z.string().default('AI 与大模型|编程与开发|GitHub 项目|科研与论文|学习与课程|网络与服务器|软件与工具|生活与消费|旅行|灵感与待研究|其他').transform(x=>x.split('|').map(s=>s.trim()).filter(Boolean)),
 MOCK_AI:z.enum(['true','false']).default('false').transform(x=>x==='true'),
 S3_ENDPOINT:z.string().optional(),S3_REGION:z.string().default('auto'),S3_BUCKET:z.string().optional(),S3_ACCESS_KEY_ID:z.string().optional(),S3_SECRET_ACCESS_KEY:z.string().optional(),
 MAX_FILE_BYTES:z.coerce.number().int().positive().default(20971520),
 MAX_MONTHLY_AI_CALLS:z.coerce.number().int().positive().default(1000),
 DOWNLOAD_TTL_SECONDS:z.coerce.number().int().min(60).max(3600).default(900)
});
export type Config=z.infer<typeof schema>;
export function loadConfig(env:NodeJS.ProcessEnv=process.env):Config {if(env===process.env)Object.assign(process.env,loadPersistentEnvironment());const p=schema.safeParse(env);if(!p.success)throw new Error('配置缺失或无效: '+p.error.issues.map(x=>x.path.join('.')+': '+x.message).join('; '));if(env===process.env&&p.data.DATABASE_URL==='local')persistConfiguration(p.data,{});return p.data;}
export function effectiveProvider(c:Config){return c.MOCK_AI||c.AI_PROVIDER==='mock'?'mock':(c.AI_PROVIDER||'openai');}
export function textModel(c:Config){return c.AI_MODEL|| (effectiveProvider(c)==='deepseek'?'deepseek-flash':c.OPENAI_MODEL);}
export function reasoningModel(c:Config){return c.AI_REASONING_MODEL||(effectiveProvider(c)==='deepseek'?'deepseek-v4-pro':textModel(c));}
export function providerKey(c:Config){switch(effectiveProvider(c)){case 'mock':return '';case 'deepseek':return c.DEEPSEEK_API_KEY||'';case 'custom':return c.AI_API_KEY||'';default:return c.OPENAI_API_KEY||'';}}
