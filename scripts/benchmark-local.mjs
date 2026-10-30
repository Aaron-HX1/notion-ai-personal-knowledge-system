import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {parse} from 'dotenv';
import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const root=process.cwd();
if(process.argv.includes('--offline')){
 const dir=await mkdtemp(join(tmpdir(),'kb-offline-'));let child;
 try{
 const id='00000000-0000-4000-8000-000000000001';await writeFile(join(dir,'.env'),`PORT=3102\nAPI_TOKEN=benchmark-token-123456789012345\nNOTION_TOKEN=benchmark-notion-token\nNOTION_KNOWLEDGE_DATA_SOURCE_ID=${id}\nNOTION_COLLECTIONS_DATA_SOURCE_ID=${id}\nNOTION_JOBS_DATA_SOURCE_ID=${id}\nMOCK_AI=true\n`);
 await writeFile(join(dir,'offline.mjs'),`globalThis.fetch=()=>new Promise(()=>{});`);
 const start=performance.now();child=spawn(process.execPath,['--import',pathToFileURL(join(dir,'offline.mjs')).href,resolve('dist/server.js')],{cwd:dir,stdio:'ignore'});
 let shell;
 for(let i=0;i<500;i++){try{const r=await fetch('http://127.0.0.1:3102/',{signal:AbortSignal.timeout(100)});shell=await r.text();break;}catch{await new Promise(r=>setTimeout(r,10));}}
 if(!shell)throw new Error('offline shell failed');
 const shellMs=performance.now()-start;
 const headers={authorization:'Bearer benchmark-token-123456789012345'};
 const status=await(await fetch('http://127.0.0.1:3102/api/status',{headers})).json();
 const startHome=performance.now();const home=await fetch('http://127.0.0.1:3102/api/home',{headers});await home.text();
 console.log(JSON.stringify({test:'Notion requests permanently stalled',shell_ms:Math.round(shellMs),home_ms:Math.round((performance.now()-startHome)*10)/10,home_status:home.status,notion:status.notion,inline_css:shell.includes('<style>'),external_stylesheet:shell.includes('rel="stylesheet"')}));
 }finally{if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}await rm(dir,{recursive:true,force:true});}
}else{
 const env=parse(await readFile('.env')),headers={authorization:'Bearer '+env.API_TOKEN},results={};
 for(const path of ['/','/api/status','/api/home','/api/system','/api/settings','/api/collections']){
 const samples=[];for(let i=0;i<10;i++){const start=performance.now();const r=await fetch('http://127.0.0.1:'+(env.PORT||3000)+path,{headers});await r.arrayBuffer();if(!r.ok)throw new Error(`${path}: ${r.status}`);samples.push(performance.now()-start);}
 samples.sort((a,b)=>a-b);results[path]={p50_ms:+samples[5].toFixed(2),p95_ms:+samples[9].toFixed(2)};
 }
 const r=await fetch('http://127.0.0.1:'+(env.PORT||3000)+'/');await r.arrayBuffer();const cached=await fetch('http://127.0.0.1:'+(env.PORT||3000)+'/',{headers:{'If-None-Match':r.headers.get('etag')}});results.etag_status=cached.status;
 await mkdir('work',{recursive:true});await writeFile('work/performance-after.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}
