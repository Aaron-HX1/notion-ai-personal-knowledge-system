

import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {Config} from './config.js';
export interface DB {query(sql:string,params?:unknown[]):Promise<{rows:any[];rowCount:number}>;end():Promise<void>}
export async function database(c:Config):Promise<DB>{if(c.DATABASE_URL==='local'){const {PGlite}=await import('@electric-sql/pglite');const dir=resolve(c.LOCAL_DATA_DIR,'pglite');await mkdir(dir,{recursive:true,mode:0o700});const local=new PGlite(dir);await local.waitReady;return {query:async(sql,params=[])=>{if(!params.length&&sql.includes(';')){await local.exec(sql);return {rows:[],rowCount:0};}const r=await local.query(sql,params as any[]);return {rows:r.rows as any[],rowCount:r.affectedRows??r.rows.length};},end:()=>local.close()};}const {default:pg}=await import('pg');const pool=new pg.Pool({connectionString:c.DATABASE_URL,max:5,connectionTimeoutMillis:5000});return {query:async(sql,params=[])=>{const r=await pool.query(sql,params);return {rows:r.rows,rowCount:r.rowCount??r.rows.length};},end:()=>pool.end()};}
export async function enqueue(db:DB,kind:string,payload:unknown){const id=crypto.randomUUID();await db.query('INSERT INTO jobs(id,kind,status,payload) VALUES($1,$2,$3,$4)',[id,kind,'queued',JSON.stringify(payload)]);return id;}
export async function claim(db:DB){const r=await db.query("UPDATE jobs SET status='running',stage='fetching',error=NULL,stage_updated_at=now() WHERE id=(SELECT id FROM jobs WHERE status='queued' AND run_after<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *");return r.rows[0];}
