import {it,expect,vi} from 'vitest';
import {Notion} from '../src/notion.js';

it('adds only missing review properties and select options to a Notion data source',async()=>{
 const old=globalThis.fetch;let schema:any={Score:{type:'number'},'Priority Level':{type:'select',select:{options:[{id:'keep-me',name:'Existing'}]}},'User Note':{type:'rich_text'}};let patch:any;
 globalThis.fetch=vi.fn(async(_url:any,init:any)=>{if(init.method==='PATCH'){patch=JSON.parse(init.body);for(const [name,value] of Object.entries(patch.properties))schema[name]={type:Object.keys(value as any)[0],...(value as any)};return new Response('{}',{status:200});}return new Response(JSON.stringify({properties:schema}),{status:200});}) as any;
 try{const notion=new Notion({NOTION_TOKEN:'dummy',NOTION_VERSION:'2026-03-11'} as any);await (notion as any).ensureReviewSchema('review-data-source');
  expect(patch.properties['Reminder Date']).toEqual({date:{}});expect(patch.properties['Review Status'].select.options.map((x:any)=>x.name)).toEqual(['待复盘 (Pending)','已复盘 (Reviewed)','已搁置 (Archived)']);
  expect(patch.properties['Priority Level'].select.options[0]).toEqual({id:'keep-me',name:'Existing'});expect(patch.properties.Score).toBeUndefined();expect(patch.properties['User Note']).toBeUndefined();
 }finally{globalThis.fetch=old;}
});
