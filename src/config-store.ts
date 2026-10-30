import {readFileSync,writeFileSync,renameSync,mkdirSync,chmodSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {parse} from 'dotenv';

export const secretKeys=['DEEPSEEK_API_KEY','OPENAI_API_KEY','AI_API_KEY','OCR_API_KEY','NOTION_TOKEN','API_TOKEN'] as const;
export type SecretKey=typeof secretKeys[number];
function read(path:string){try{return readFileSync(path,'utf8');}catch(e:any){if(e.code==='ENOENT')return '';throw new Error('无法读取本地配置，请检查文件权限');}}
function decode(content:string){const values=parse(content);for(const line of content.split('\n')){const m=line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(".*")\s*$/);if(m)try{values[m[1]]=JSON.parse(m[2]);}catch{}}return values;}
function backupPath(envPath:string){return join(dirname(resolve(envPath)),'data','config.json');}
function backup(path:string):Record<string,string>{const raw=read(path);if(!raw)return {};try{const data=JSON.parse(raw);if(data.version!==1||!data.values||Object.values(data.values).some(v=>typeof v!=='string'))throw 0;return data.values;}catch{throw new Error('本地配置备份损坏，请从安全备份恢复 data/config.json');}}
function atomic(path:string,content:string){mkdirSync(dirname(path),{recursive:true,mode:0o700});const temp=path+'.tmp-'+crypto.randomUUID();writeFileSync(temp,content,{mode:0o600});renameSync(temp,path);chmodSync(path,0o600);}
function patch(content:string,values:Record<string,string>){for(const [key,value] of Object.entries(values)){if(!/^[A-Z_][A-Z0-9_]*$/.test(key)||/[\r\n]/.test(value))throw new Error('配置包含无效字符');const line=`${key}=${JSON.stringify(value)}`,pattern=new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`,'gm');let seen=false;content=content.replace(pattern,()=>{if(seen)return '';seen=true;return line;});if(!seen)content+=(content.endsWith('\n')||!content?'':'\n')+line+'\n';}return content;}
export function loadPersistentEnvironment(envPath=resolve('.env')){
 const content=read(envPath),disk=decode(content);let cold:Record<string,string>;try{cold=backup(backupPath(envPath));}catch(e){if(!content)throw e;cold={};}const values={...cold,...disk};
 // An empty form or accidentally blank line must not erase a previously saved key.
 for(const key of secretKeys)if(!disk[key]&&cold[key])values[key]=cold[key];
 if(!existsSync(envPath)&&Object.keys(values).length)atomic(envPath,patch('',values));
 return values;
}
export function persistConfiguration(current:Record<string,unknown>,updates:Record<string,unknown>,envPath=resolve('.env'),deleteKeys:readonly string[]=[]){
 const content=read(envPath);let cold:Record<string,string>;try{cold=backup(backupPath(envPath));}catch(e){if(!content)throw e;cold={};}
 const values:Record<string,string>={...cold,...decode(content)};
 for(const [key,value] of Object.entries(current))if(value!==undefined&&value!==null)values[key]=Array.isArray(value)?value.join('|'):String(value);
 const changed:Record<string,string>={};
 for(const [key,value] of Object.entries(updates)){if(value===undefined)continue;if(secretKeys.includes(key as SecretKey)&&!String(value).trim())continue;changed[key]=String(value);}
 for(const key of deleteKeys){if(!secretKeys.includes(key as SecretKey))throw new Error('不允许删除此配置');changed[key]='';}
 Object.assign(values,changed);
 atomic(backupPath(envPath),JSON.stringify({version:1,updated_at:new Date().toISOString(),values},null,2)+'\n');
 atomic(envPath,patch(content,changed));
 return changed;
}
export function hasSavedSecret(value:unknown){return typeof value==='string'&&!!value.trim()&&!value.toLowerCase().includes('replace');}
export function maskedSecrets(c:Record<string,unknown>){return Object.fromEntries(secretKeys.map(key=>[key,{configured:hasSavedSecret(c[key]),masked:hasSavedSecret(c[key])?'••••••••（已保存）':''}]));}
