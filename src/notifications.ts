import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {Config} from './config.js';
import type {DB} from './db.js';
import {REVIEW_STATUSES} from './review.js';
const exec=promisify(execFile);
const quote=(s:string)=>'"'+s.replaceAll('\\','\\\\').replaceAll('"','\\"').replace(/[\r\n]/g,' ')+'"';
export async function notifyDesktop(title:string,message:string){
 if(process.platform!=='darwin')return false;
 const script=`display notification ${quote(message)} with title ${quote(title)}`;
 await exec('osascript',['-e',script],{timeout:6000});return true;
}
export async function notifyScore(c:Config,score:number,title:string,send=notifyDesktop){if(c.DATABASE_URL!=='local'||score<8)return false;try{return await send(`KnowledgeBot · ${score} 分`,title);}catch{return false;}}
export async function notifyDueReviews(c:Config,db:DB,platform=process.platform,send=notifyDesktop){
 if(c.DATABASE_URL!=='local'||platform!=='darwin')return {sent:0};
 const rows=(await db.query('SELECT notion_id,title,score FROM resources WHERE reminder_date<=CURRENT_DATE AND review_status=$1 AND (review_notified_at IS NULL OR review_notified_at::date<CURRENT_DATE)',[REVIEW_STATUSES[0]])).rows;let sent=0;
 for(const r of rows){try{await send('KnowledgeBot · 到期复盘',`${r.score??'未评分'} 分：${r.title}`);await db.query('UPDATE resources SET review_notified_at=now() WHERE notion_id=$1',[r.notion_id]);sent++;}catch{}}
 return {sent};
}
