import {Notion,required} from './notion.js';
import {loadConfig} from './config.js';
import {persistConfiguration} from './config-store.js';
import {notionParentId} from './notion-parent.js';
import {PRIORITY_LEVELS,REVIEW_STATUSES} from './review.js';
const sources=[['knowledge','Knowledge Base','NOTION_KNOWLEDGE_DATA_SOURCE_ID'],['collections','Collections','NOTION_COLLECTIONS_DATA_SOURCE_ID'],['jobs','AI Jobs','NOTION_JOBS_DATA_SOURCE_ID']] as const;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function bootstrapNotion(env:Record<string,string>,path='.env',override?:Notion){
 if(!env.NOTION_TOKEN||env.NOTION_TOKEN.toLowerCase().includes('replace'))throw new Error('请在 .env 填写你自己的 NOTION_TOKEN');
 const blank='00000000-0000-4000-8000-000000000000';
 const c=loadConfig({...env,...Object.fromEntries(sources.map(([, ,key])=>[key,uuid.test(env[key]||'')&&env[key]!== '00000000-0000-0000-0000-000000000000'?env[key]:blank]))});
 const n=override||new Notion(c),needs=sources.some(([, ,key])=>c[key]===blank);
 let parent='';let children:any[]=[];
 if(needs){if(!env.NOTION_PARENT_PAGE_URL)throw new Error('首次部署请填写 NOTION_PARENT_PAGE_URL，并在 Notion 父页面的连接菜单授权机器人');parent=notionParentId(env.NOTION_PARENT_PAGE_URL);await n.page(parent);children=await n.blocks(parent);}
 for(const [kind,name,key] of sources){
  if(c[key]!==blank)continue;
  const matches=children.filter(p=>p.type==='child_database'&&p.child_database?.title===name);if(matches.length>1)throw new Error(`父页面存在多个 ${name}，请手工填写对应 data source ID，避免误用`);
  let database:any;
  if(matches.length)database=await n.call('/databases/'+matches[0].id);
  else{
   const properties:any={};
   for(const [field,type] of Object.entries(required[kind])){
    if(type==='relation')continue;
    let options:string[]=[];
    if(field==='Category')options=c.CATEGORIES;
    if(field==='Type')options=['web','github','text','pdf','docx','image'];
    if(field==='Processing Status')options=['待确认','已完成'];
    if(field==='Priority Level')options=PRIORITY_LEVELS.map(x=>x.name);
    if(field==='Review Status')options=[...REVIEW_STATUSES];
    if(field==='Learning Status')options=['待学习','已学习','已部署'];
    properties[field]={[type]:type==='select'?{options:options.map(name=>({name}))}:type==='number'?{format:'number'}:{}};
   }
   database=await n.call('/databases','POST',{parent:{type:'page_id',page_id:parent},title:[{text:{content:name}}],initial_data_source:{properties}});
  }
  if(!database.data_sources?.length)database=await n.call('/databases/'+database.id);
  if(database.data_sources?.length!==1)throw new Error(`${name} 包含多个或缺失数据源，请手工填写对应 ID`);
  c[key]=database.data_sources[0].id;env[key]=c[key];
  // Save each successful step so a retry can resume without recreating databases.
  persistConfiguration(env,{[key]:c[key]},path);
 }
 const relations=[['NOTION_KNOWLEDGE_DATA_SOURCE_ID','Related Collections','NOTION_COLLECTIONS_DATA_SOURCE_ID'],['NOTION_COLLECTIONS_DATA_SOURCE_ID','Related Resources','NOTION_KNOWLEDGE_DATA_SOURCE_ID'],['NOTION_JOBS_DATA_SOURCE_ID','Target Resource','NOTION_KNOWLEDGE_DATA_SOURCE_ID']] as const;
 for(const [source,field,target] of relations){const ds=await n.call('/data_sources/'+c[source]);if(!ds.properties?.[field])await n.call('/data_sources/'+c[source],'PATCH',{properties:{[field]:{relation:{data_source_id:c[target],type:'single_property',single_property:{}}}}});}
 await n.validate(true);return {configured:true};
}
