import type {Config} from './config.js';
import {claim,type DB} from './db.js';
import {Notion} from './notion.js';
import {AI} from './ai.js';
import {Storage} from './storage.js';
import {Importer} from './importer.js';
import {exportCollection} from './archive.js';
import {summarizeCollection} from './collections.js';
import {rebuildIndex} from './sync.js';
import {safeError} from './redact.js';
import {notifyDueReviews} from './notifications.js';

const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export async function runWorker(c:Config,db:DB,signal?:AbortSignal){
 const notion=new Notion(c),ai=new AI(c,db),storage=new Storage(c),importer=new Importer(c,db,notion,ai,storage);
 await notion.validate();
 let nextSync=Date.now()+5_000,nextReminderSweep=Date.now()+5_000;
 async function worker(index:number){
  while(!signal?.aborted){
   if(index===0&&Date.now()>=nextReminderSweep){try{await notifyDueReviews(c,db);}catch{}nextReminderSweep=Date.now()+60_000;}
   if(index===0&&Date.now()>=nextSync){try{const result=await rebuildIndex(c,db,notion);console.log(JSON.stringify({event:'index_synced',...result}));}catch{console.error(JSON.stringify({event:'index_sync_failed'}));}nextSync=Date.now()+24*60*60*1000;}
   const job=await claim(db);
   if(!job){
    await pause(400);continue;
   }
   let jobPage=job.notion_id;
   try{
    if(!jobPage){const p=await notion.create(c.NOTION_JOBS_DATA_SOURCE_ID,{Title:{title:[{text:{content:`${job.kind} ${job.id}`}}]},'Job Type':{select:{name:job.kind}},Status:{select:{name:'running'}},'Retry Count':{number:job.retries}});jobPage=p.id;await db.query('UPDATE jobs SET notion_id=$2 WHERE id=$1',[job.id,jobPage]);}
    const stage=async(value:string)=>{await db.query('UPDATE jobs SET stage=$2,stage_updated_at=now() WHERE id=$1',[job.id,value]);};
    let result:any;
    if(job.kind==='import')result=await importer.run(job.payload,stage);
    else if(job.kind==='export'){await stage('exporting');result=await exportCollection(db,storage,job.payload.id,notion);}
    else if(job.kind==='summarize'){await stage('analyzing');result=await summarizeCollection(c,db,notion,ai,job.payload.id);}
    else throw new Error('未知任务');
    await db.query("UPDATE jobs SET status='done',stage='done',error=NULL,stage_updated_at=now(),result=$2,completed_at=now() WHERE id=$1",[job.id,JSON.stringify(result)]);
    await notion.update(jobPage,{Status:{select:{name:'done'}},'Error Message':{rich_text:[]},'Completed Time':{date:{start:new Date().toISOString()}},...(result?.resource_id?{'Target Resource':{relation:[{id:result.resource_id}]}}:{})});
   }catch(e){
    const retries=job.retries+1,failed=retries>=4;
    await db.query("UPDATE jobs SET status=$2,stage=$2,stage_updated_at=now(),retries=$3,error=$4,run_after=now()+($5 || ' seconds')::interval,completed_at=CASE WHEN $2='failed' THEN now() ELSE NULL END WHERE id=$1",[job.id,failed?'failed':'queued',retries,safeError(e,c),String(Math.min(300,2**retries*5))]);
    if(jobPage)await notion.update(jobPage,{Status:{select:{name:failed?'failed':'queued'}},'Error Message':{rich_text:[{text:{content:safeError(e,c)}}]},'Retry Count':{number:retries}}).catch(()=>{});
    console.error(JSON.stringify({event:'job_failed',id:job.id,kind:job.kind,retries}));
   }
  }
 }
 await Promise.all(Array.from({length:3},(_,i)=>worker(i)));
}
