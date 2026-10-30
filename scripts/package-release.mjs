import {readdir,readFile,writeFile,mkdir,stat,chmod} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import yazl from 'yazl';import {parse} from 'dotenv';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const rootFiles=['.env.example','.gitignore','.dockerignore','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','vitest.config.ts','README.md','DEPLOY_GUIDE.md','DEPLOY_GUIDE.html','LICENSE','THIRD_PARTY_NOTICES.md','Dockerfile','render.yaml','start.command','install-and-run.command','KnowledgeBot.command','run-local.command'];
const folders=['src','public','migrations','tests','scripts','.github'];
const docs=['docs/USER_GUIDE.md','docs/api.md','docs/notion-setup.md','docs/operations.md','docs/deploy.md'];
const blocked=path=>path.split('/').some(part=>['node_modules','data','dist','work','outputs','.git','.tools','__pycache__','.DS_Store'].includes(part))||/(?:^|\/)\.env(?!\.example$)|\.(?:sqlite(?:-\w+)?|db(?:-\w+)?|log|tmp|temp|bak|swp|swo|tsbuildinfo|pem|key|p12|pfx|pyc|cookies|zip)$/i.test(path);
export async function releaseFiles(base=root){
 const result=[];async function walk(path){for(const entry of await readdir(join(base,path),{withFileTypes:true})){const name=path+'/'+entry.name;if(blocked(name))continue;if(entry.isSymbolicLink())throw new Error('发布包禁止符号链接：'+name);if(entry.isDirectory())await walk(name);else if(entry.isFile())result.push(name);}}
 for(const file of [...rootFiles,...docs]){if(blocked(file))throw new Error('发布白名单包含禁止路径');await stat(join(base,file));result.push(file);}for(const folder of folders)await walk(folder);return result.sort();
}
export async function buildRelease(base=root,stamp){
 stamp??=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date()).replace(' ','_').replace(':','-');
 const name='KnowledgeBot_朋友部署包_v1.0_'+stamp,destination=join(base,'outputs',name),folder=join(destination,'KnowledgeBot');
 // Fail if an artifact already exists: older releases are never silently overwritten.
 await mkdir(destination,{recursive:false});await mkdir(folder);
 let secrets=[];try{const env=parse(await readFile(join(base,'.env')));secrets=['NOTION_TOKEN','API_TOKEN','DEEPSEEK_API_KEY','OPENAI_API_KEY','AI_API_KEY','OCR_API_KEY','S3_SECRET_ACCESS_KEY','S3_ACCESS_KEY_ID', 'NOTION_KNOWLEDGE_DATA_SOURCE_ID','NOTION_COLLECTIONS_DATA_SOURCE_ID','NOTION_JOBS_DATA_SOURCE_ID','NOTION_PARENT_PAGE_URL'].map(key=>env[key]).filter(value=>value&&value.length>=12&&!value.toLowerCase().includes('replace')&&!/^0{8}-/.test(value));}catch{}
 const files=await releaseFiles(base),entries=[];
 for(const file of files){const bytes=await readFile(join(base,file));const text=bytes.toString('utf8');if(secrets.some(secret=>text.includes(secret)||(/^[0-9a-f-]{36}$/i.test(secret)&&text.includes(secret.replaceAll('-',''))))||/\b(?:sk-|ntn_|secret_)[A-Za-z0-9_-]{24,}/.test(text))throw new Error('发布检查发现本地凭证或个人数据源 ID，已停止：'+file);if(/\/Users\/[^/\s]+\//.test(text))throw new Error('发布检查发现个人路径或父页面 ID：'+file);const mode=(await stat(join(base,file))).mode&0o777;const target=join(folder,file);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{mode});await chmod(target,mode);entries.push({path:file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,mode});}
 const manifest=Buffer.from(JSON.stringify({format:'knowledgebot-source-release/v1',version:'1.0.0',created_at:new Date().toISOString(),files:entries,excluded:'Credentials, instance documents, runtime data, node_modules, dist, work, outputs and temporary files'},null,2)+'\n');await writeFile(join(folder,'RELEASE_MANIFEST.json'),manifest);
 const sums=entries.map(file=>file.sha256+'  '+file.path).concat(createHash('sha256').update(manifest).digest('hex')+'  RELEASE_MANIFEST.json').join('\n')+'\n';await writeFile(join(folder,'SHA256SUMS.txt'),sums);
 const zip=new yazl.ZipFile();for(const file of [...entries,{path:'RELEASE_MANIFEST.json',mode:0o644},{path:'SHA256SUMS.txt',mode:0o644}])zip.addFile(join(folder,file.path),'KnowledgeBot/'+file.path,{mode:0o100000|file.mode});zip.end();const archive=join(base,'outputs',name+'.zip');await pipeline(zip.outputStream,createWriteStream(archive,{flags:'wx'}));const digest=createHash('sha256').update(await readFile(archive)).digest('hex');await writeFile(archive+'.sha256',digest+'  '+name+'.zip\n');return {folder,archive,files:entries.length,bytes:(await stat(archive)).size,sha256:digest};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){await mkdir(join(root,'outputs'),{recursive:true});console.log(JSON.stringify(await buildRelease(),null,2));}
