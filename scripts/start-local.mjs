import {readFile,stat,readdir,mkdir,writeFile,open,unlink} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {parse} from 'dotenv';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function needsBuild(base=root){
 let built;try{built=(await stat(join(base,'dist/server.js'))).mtimeMs;}catch{return true;}
 async function newer(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory()){if(await newer(path))return true;}else if((await stat(path)).mtimeMs>built)return true;}return false;}
 return await newer(join(base,'src'))||(await stat(join(base,'tsconfig.json'))).mtimeMs>built;
}
export function agentPlist(node,base){const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>com.knowledgebot.local</string><key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(join(base,'dist/server.js'))}</string></array><key>WorkingDirectory</key><string>${xml(base)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(dirname(node))}:/usr/bin:/bin:/usr/sbin:/sbin</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>10</integer><key>ProcessType</key><string>Background</string><key>StandardOutPath</key><string>${xml(join(base,'work/server.log'))}</string><key>StandardErrorPath</key><string>${xml(join(base,'work/server.log'))}</string></dict></plist>`;}
async function main(){
 process.chdir(root);let values={};try{values=parse(await readFile('.env'));}catch{try{values=JSON.parse(await readFile('data/config.json')).values;}catch{throw new Error('缺少本地配置，请先配置 Notion');}}
 const port=Number(values.PORT||3000),url=`http://localhost:${port}/`;
 const running=async()=>{try{const r=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(400)});const data=await r.json();return data.service==='knowledgebot'&&data.ok===true;}catch{return false;}};
 const show=()=>{spawn('open',[url],{stdio:'ignore',detached:true}).unref();};
 if(await running()){show();return;}
 // Wait for an existing supervisor to finish a clean shutdown or restart its child.
 let previousPid=0;try{previousPid=Number(await readFile('work/supervisor.pid','utf8'));}catch{}
 if(Number.isInteger(previousPid)&&previousPid>1){for(let i=0;i<150;i++){let alive=true;try{process.kill(previousPid,0);}catch{alive=false;}if(!alive)break;if(await running()){show();return;}if(i===149)throw new Error('后台服务仍在启动或关闭，请稍后再次打开');await new Promise(r=>setTimeout(r,100));}}
 await mkdir('work',{recursive:true,mode:0o700});
 let lock;try{lock=await open('work/launcher.lock','wx',0o600);}catch(error){
  if(error.code!=='EEXIST')throw error;let alive=false;try{const pid=Number(await readFile('work/launcher.lock','utf8'));if(Number.isInteger(pid)&&pid>1){process.kill(pid,0);alive=true;}}catch{}
  if(!alive){await unlink('work/launcher.lock').catch(()=>{});lock=await open('work/launcher.lock','wx',0o600);}else{for(let i=0;i<150;i++){if(await running()){show();return;}await new Promise(r=>setTimeout(r,100));}throw new Error('另一个启动器尚未完成，请查看 work/server.log');}
 }
 await lock.writeFile(String(process.pid));
 try{
 if(await needsBuild())execFileSync(process.execPath,['node_modules/typescript/bin/tsc'],{cwd:root,stdio:'inherit'});
 await mkdir('work',{recursive:true,mode:0o700});
 const detached=async()=>{const log=await open('work/server.log','a',0o600);const child=spawn(process.execPath,['scripts/supervisor.mjs'],{cwd:root,detached:true,stdio:['ignore',log.fd,log.fd]});child.unref();await log.close();};
 let mode='';try{mode=JSON.parse(await readFile('work/daemon-mode.json','utf8')).mode;}catch{}
 if(process.platform==='darwin'&&mode!=='supervisor'){
  let agentPath='';try{const folder=join(homedir(),'Library/LaunchAgents'),path=join(folder,'com.knowledgebot.local.plist'),domain=`gui/${process.getuid()}`;agentPath=path;await mkdir(folder,{recursive:true});const plist=agentPlist(process.execPath,root);let previous='';try{previous=await readFile(path,'utf8');}catch{}
  if(previous!==plist){try{execFileSync('launchctl',['bootout',domain+'/com.knowledgebot.local'],{stdio:'ignore'});}catch{}await writeFile(path,plist,{mode:0o600});}
  try{execFileSync('launchctl',['print',domain+'/com.knowledgebot.local'],{stdio:'ignore'});}catch{execFileSync('launchctl',['bootstrap',domain,path],{stdio:'ignore'});}
  execFileSync('launchctl',['kickstart',domain+'/com.knowledgebot.local'],{stdio:'ignore'});
  // Some macOS privacy policies prevent launchd from reading a Documents checkout.
  for(let i=0;i<30;i++){if(await running()){show();return;}await new Promise(r=>setTimeout(r,100));}
  try{execFileSync('launchctl',['bootout',domain+'/com.knowledgebot.local'],{stdio:'ignore'});}catch{}
  await unlink(path).catch(()=>{});console.log('macOS launchd 未就绪，使用独立后台守护（保留系统隐私保护）。');await writeFile('work/daemon-mode.json',JSON.stringify({mode:'supervisor',reason:'launchd_unavailable'}),{mode:0o600});await detached();}catch{try{execFileSync('launchctl',['bootout',`gui/${process.getuid()}/com.knowledgebot.local`],{stdio:'ignore'});}catch{}if(agentPath)await unlink(agentPath).catch(()=>{});await writeFile('work/daemon-mode.json',JSON.stringify({mode:'supervisor',reason:'launchd_unavailable'}),{mode:0o600});await detached();}
 }else{
  await detached();
 }
 for(let i=0;i<100;i++){if(await running()){show();return;}await new Promise(r=>setTimeout(r,100));}
 throw new Error('服务未能启动，请查看 work/server.log。检查端口冲突或 macOS 后台项目权限。');
 }finally{await lock.close();await unlink('work/launcher.lock').catch(()=>{});}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(error.message);process.exitCode=1;});
