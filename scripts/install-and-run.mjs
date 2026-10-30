// This installer uses only Node built-ins until the dependency install completes.
import {readFile,writeFile,access,chmod,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const exists=async path=>{try{await access(path);return true;}catch{return false;}};
function run(bin,args){const r=spawnSync(bin,args,{cwd:root,stdio:'inherit',env:{...process.env,PATH:dirname(process.execPath)+':'+(process.env.PATH||'')}});if(r.status!==0)throw new Error('安装或构建失败，请检查上方错误。你的配置和资料未被删除。');}
function edit(){if(process.env.KB_INSTALL_NO_OPEN==='1')return;spawnSync('open',['-a','TextEdit',join(root,'.env')]);spawnSync('open',[join(root,'DEPLOY_GUIDE.html')]);}
async function main(){
 if(Number(process.versions.node.split('.')[0])<22)throw new Error('请安装 Node.js 22 或更新的 LTS 版本');

 if(!await exists('.env')&&!await exists('data/config.json')){let template=await readFile('.env.example','utf8');template=template.replace(/^API_TOKEN=.*$/m,'API_TOKEN='+randomBytes(32).toString('hex'));await writeFile('.env',template,{mode:0o600});}
 const lockHash=createHash('sha256').update(await readFile('pnpm-lock.yaml')).digest('hex');
 if(await exists('dist/config-store.js')&&await exists('node_modules/typescript/bin/tsc')){
  let stamp='';try{stamp=await readFile('work/install-lock.sha256','utf8');}catch{}
  if(stamp===lockHash){const store=await import(pathToFileURL(join(root,'dist/config-store.js')).href);const values=store.loadPersistentEnvironment();if(values.NOTION_TOKEN&&['NOTION_KNOWLEDGE_DATA_SOURCE_ID','NOTION_COLLECTIONS_DATA_SOURCE_ID','NOTION_JOBS_DATA_SOURCE_ID'].every(key=>values[key]&&values[key]!=='00000000-0000-0000-0000-000000000000')){run(process.execPath,['scripts/start-local.mjs']);return;}}
 }
 // Bootstrap pnpm into the project rather than requiring sudo or global installs.
 const manifest=JSON.parse(await readFile('package.json','utf8')),version=manifest.packageManager.split('@')[1];
 const existing=spawnSync('pnpm',['--version'],{encoding:'utf8'});let bin='pnpm',prefix=[];
 if(existing.status!==0||existing.stdout.trim()!==version){
  console.log('正在安装项目指定版本的 pnpm（仅保存在本项目 .tools）…');
  const npm=join(dirname(process.execPath),'npm');const command=await exists(npm)?npm:'npm';
  run(command,['install','--prefix',join(root,'.tools'),'--no-save','--no-package-lock','--no-audit','--no-fund','pnpm@'+version]);
  bin=process.execPath;prefix=[join(root,'.tools/node_modules/pnpm/bin/pnpm.cjs')];
 }
 console.log('正在安装依赖；首次安装需要联网，耗时取决于网络…');run(bin,[...prefix,'install','--frozen-lockfile']);
 // Compilation is necessary on a clean distribution; daily launches skip this path.
 run(bin,[...prefix,'build']);await mkdir('work',{recursive:true,mode:0o700});await writeFile('work/install-lock.sha256',lockHash,{mode:0o600});
 const store=await import(pathToFileURL(join(root,'dist/config-store.js')).href);const env=store.loadPersistentEnvironment();
 if(!env.NOTION_TOKEN||(!env.NOTION_PARENT_PAGE_URL&&!env.NOTION_KNOWLEDGE_DATA_SOURCE_ID)){
  console.log('已准备好运行环境和 .env。请填写 Notion Token 与已授权父页面链接，保存后再次双击 start.command。');edit();return;
 }
 const {bootstrapNotion}=await import(pathToFileURL(join(root,'dist/notion-bootstrap.js')).href);
 try{console.log('正在验证或初始化你自己的 Notion 数据库…');await bootstrapNotion(env);}
 catch(error){const {safeError}=await import(pathToFileURL(join(root,'dist/redact.js')).href);console.error(safeError(error,env));console.log('请检查 .env 与父页面授权，保存后再次双击。');edit();process.exitCode=1;return;}
 console.log('Notion 已就绪，正在打开控制台…');run(process.execPath,['scripts/start-local.mjs']);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
