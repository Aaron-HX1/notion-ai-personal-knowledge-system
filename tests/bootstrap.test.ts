import {it,expect,vi} from 'vitest';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {bootstrapNotion} from '../src/notion-bootstrap.js';
import {notionParentId} from '../src/notion-parent.js';
import {required} from '../src/notion.js';
it('accepts copied parent page links and rejects non-Notion or invalid links',()=>{
 expect(notionParentId('https://www.notion.so/My-Page-00000000000040008000000000000001?source=copy_link')).toBe('00000000-0000-4000-8000-000000000001');
 expect(()=>notionParentId('https://evil.example/00000000000040008000000000000001')).toThrow();expect(()=>notionParentId('https://www.notion.so/no-id')).toThrow();
});
it('creates three complete sources, persists progress and resumes without duplicates',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kb-bootstrap-'));let creates=0,fail=true;const records=new Map<string,any>();const children:any[]=[];
 const env={API_TOKEN:'fixture-api-token-12345678901234',NOTION_TOKEN:'fixture-notion-token',NOTION_PARENT_PAGE_URL:'https://www.notion.so/00000000000040008000000000000001',MOCK_AI:'true'};
 const fake:any={page:vi.fn(async()=>({})),blocks:async()=>children,call:async(path:string,method='GET',body:any)=>{
  if(path==='/databases'&&method==='POST'){
   if(creates===1&&fail){fail=false;throw new Error('temporary network failure');}
   creates++;const db='20000000-0000-4000-8000-'+String(creates).padStart(12,'0'),ds='30000000-0000-4000-8000-'+String(creates).padStart(12,'0');
   const properties=Object.fromEntries(Object.entries(body.initial_data_source.properties).map(([key,value]:any)=>[key,{...value,type:Object.keys(value)[0]}]));const record={id:db,data_sources:[{id:ds}],properties};records.set('/databases/'+db,record);records.set('/data_sources/'+ds,record);children.push({id:db,type:'child_database',child_database:{title:body.title[0].text.content}});return record;
  }
  const record=records.get(path);if(!record)throw new Error('unknown source');if(method==='PATCH')for(const [key,value] of Object.entries(body.properties))record.properties[key]={...value as object,type:Object.keys(value as object)[0]};return record;
 },validate:vi.fn(async()=>{for(const [index,kind] of ['knowledge','collections','jobs'].entries()){const record=[...records.values()][index*2];for(const [field,type] of Object.entries(required[kind as keyof typeof required]))expect(record.properties[field]?.type).toBe(type);}})};
 try{
  await expect(bootstrapNotion(env,join(root,'.env'),fake)).rejects.toThrow('temporary network failure');expect(await readFile(join(root,'.env'),'utf8')).toContain('NOTION_KNOWLEDGE_DATA_SOURCE_ID');
  await bootstrapNotion(env,join(root,'.env'),fake);expect(creates).toBe(3);await bootstrapNotion(env,join(root,'.env'),fake);expect(creates).toBe(3);expect(fake.validate).toHaveBeenCalledTimes(2);
 }finally{await rm(root,{recursive:true,force:true});}
});
