import {persistConfiguration} from './config-store.js';
import {copyFile,mkdir,readFile,readdir,stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {homedir} from 'node:os';
import {isAbsolute,join,resolve,sep} from 'node:path';
import type {Config} from './config.js';

export function icloudSuggestion(){return join(homedir(),'Library','Mobile Documents','com~apple~CloudDocs','KnowledgeBot');}
export async function icloudAvailable(){try{await stat(join(homedir(),'Library','Mobile Documents','com~apple~CloudDocs'));return true;}catch{return false;}}
export function validateStorageDirectory(value:string){
  if(!isAbsolute(value))throw new Error('请输入绝对路径');
  const path=resolve(value),home=resolve(homedir());
  if(!path.startsWith(home+sep))throw new Error('本地文件目录必须位于当前用户主目录下');
  return path;
}
async function copyTree(from:string,to:string){
  await mkdir(to,{recursive:true,mode:0o700});
  for(const entry of await readdir(from,{withFileTypes:true})){
    const source=join(from,entry.name),target=join(to,entry.name);
    if(entry.isDirectory())await copyTree(source,target);
    else if(entry.isFile()){
      try{await copyFile(source,target,constants.COPYFILE_EXCL);}
      catch(e:any){if(e.code!=='EEXIST')throw e;const [a,b]=await Promise.all([readFile(source),readFile(target)]);if(!a.equals(b))throw new Error(`目标目录已有不同内容的同名文件：${entry.name}`);}
    }
  }
}
export async function prepareStorageDirectory(oldValue:string,newValue:string){
  const oldPath=resolve(oldValue),newPath=validateStorageDirectory(newValue);
  if(oldPath===newPath)return newPath;
  if(newPath.startsWith(oldPath+sep)||oldPath.startsWith(newPath+sep))throw new Error('新旧存储目录不能互相包含');
  await mkdir(newPath,{recursive:true,mode:0o700});
  try{await stat(oldPath);await copyTree(oldPath,newPath);}catch(e:any){if(e.code!=='ENOENT')throw e;}
  return newPath;
}
export type LocalSettingsUpdate=Partial<Pick<Config,'API_TOKEN'|'MOCK_AI'|'OPENAI_API_KEY'|'LOCAL_STORAGE_DIR'|'NOTION_TOKEN'|'AI_PROVIDER'|'AI_BASE_URL'|'AI_API_KEY'|'AI_MODEL'|'AI_REASONING_MODEL'|'DEEPSEEK_API_KEY'|'OCR_ENGINE'|'OCR_BASE_URL'|'OCR_API_KEY'|'OCR_MODEL'>>;
export async function saveLocalSettings(c:Config,updates:LocalSettingsUpdate,filePath='.env'){
  const changed=persistConfiguration(c,updates,filePath);
  Object.assign(process.env,changed);
  Object.assign(c,Object.fromEntries(Object.entries(updates).filter(([key,value])=>value!==undefined&&(!(key.endsWith('_KEY')||key.endsWith('_TOKEN'))||String(value).trim()))));
}
