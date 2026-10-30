import {it,expect,vi} from 'vitest';
import {lazyDatabase} from '../src/lazy-db.js';
import {SnapshotCache} from '../src/ui-cache.js';
import {mkdtemp,readFile,rm,mkdir,writeFile,utimes} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
// @ts-ignore launcher is native ESM, tested without launching a daemon.
import {needsBuild,agentPlist} from '../scripts/start-local.mjs';
it('does not initialize DB until requested and shares one concurrent initialization',async()=>{
 const query=vi.fn(async()=>({rows:[],rowCount:0})),open=vi.fn(async()=>({query,end:async()=>{}}));const lazy=lazyDatabase(open);
 expect(open).not.toHaveBeenCalled();await Promise.all([lazy.db.query('a'),lazy.db.query('b')]);expect(open).toHaveBeenCalledTimes(1);expect(lazy.state.phase).toBe('ready');await lazy.db.end();
});
it('keeps the UI snapshot available while a slow refresh is pending or fails',async()=>{
 const cache=new SnapshotCache({count:3});let reject!:(error:Error)=>void;
 const pending=cache.refresh(()=>new Promise((_,r)=>{reject=r;}));expect(cache.value.count).toBe(3);expect(cache.refreshing).toBe(true);reject(new Error('offline'));await expect(pending).rejects.toThrow('offline');expect(cache.value.count).toBe(3);
});
it('persists snapshots for a new service process',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kb-cache-'));try{const path=join(root,'cache.json'),first=new SnapshotCache({count:0},path);await first.refresh(async()=>({count:7}));const next=new SnapshotCache({count:0},path);await next.load();expect(next.value).toEqual({count:7});}finally{await rm(root,{recursive:true,force:true});}
});
it('only rebuilds missing or outdated server output and generates a secret-free crash-restart agent',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kb-build-'));try{await mkdir(join(root,'src'));await mkdir(join(root,'dist'));await writeFile(join(root,'src/server.ts'),'source');await writeFile(join(root,'tsconfig.json'),'{}');expect(await needsBuild(root)).toBe(true);await writeFile(join(root,'dist/server.js'),'built');const future=new Date(Date.now()+1000);await utimes(join(root,'dist/server.js'),future,future);expect(await needsBuild(root)).toBe(false);await utimes(join(root,'src/server.ts'),new Date(Date.now()+2000),new Date(Date.now()+2000));expect(await needsBuild(root)).toBe(true);const plist=agentPlist('/node',root);expect(plist).toContain('<key>SuccessfulExit</key><false/>');expect(plist).not.toMatch(/API_KEY|NOTION_TOKEN/);}finally{await rm(root,{recursive:true,force:true});}
});
it('loads Markdown on demand and avoids external font dependencies',async()=>{
 const js=await readFile('public/app.js','utf8'),css=await readFile('public/styles.css','utf8');expect(js).toContain("import('/markdown.js')");expect(css).not.toContain('@import');
});
it('restarts a crashed isolated server and respects a deliberate clean stop',async()=>{
 const {spawn}=await import('node:child_process');const {createServer}=await import('node:net');const {once}=await import('node:events');
 const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=(probe.address() as any).port;await new Promise<void>(done=>probe.close(()=>done()));
 const root=await mkdtemp(join(tmpdir(),'kb-supervisor-'));let supervisor:any;
 try{await mkdir(join(root,'work'));await mkdir(join(root,'dist'));await writeFile(join(root,'dist/server.js'),`const server=require('node:http').createServer((req,res)=>{res.end(JSON.stringify({pid:process.pid}));if(req.url==='/stop')server.close(()=>process.exit(0));});server.listen(${port},'127.0.0.1');`);
 supervisor=spawn(process.execPath,[join(process.cwd(),'scripts/supervisor.mjs')],{cwd:root,stdio:'ignore'});
 const get=async(exclude?:number)=>{for(let i=0;i<150;i++){try{const r=await fetch('http://127.0.0.1:'+port);const j=await r.json();if(j.pid!==exclude)return j.pid;}catch{}await new Promise(r=>setTimeout(r,20));}throw new Error('isolated supervisor did not recover');};
 const first=await get();process.kill(first,'SIGKILL');expect(await get(first)).not.toBe(first);
 const exited=once(supervisor,'exit');await fetch('http://127.0.0.1:'+port+'/stop');const [code]=await exited;expect(code).toBe(0);
 }finally{supervisor?.kill('SIGTERM');await rm(root,{recursive:true,force:true});}
},10000);
