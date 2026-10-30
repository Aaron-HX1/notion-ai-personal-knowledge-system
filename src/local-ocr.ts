import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir,platform} from 'node:os';
import {join,resolve} from 'node:path';

function command(bin:string,args:string[],timeoutMs:number):Promise<string>{
 return new Promise((resolve,reject)=>{
  const child=spawn(bin,args,{stdio:['ignore','pipe','pipe']});let out='',err='';
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('本地 OCR 超时'));},timeoutMs);
  child.stdout.on('data',b=>out+=String(b));child.stderr.on('data',b=>err+=String(b));
  child.on('error',e=>{clearTimeout(timer);reject(e)});
  child.on('close',code=>{clearTimeout(timer);code===0?resolve(out.trim()):reject(new Error((err||`OCR 退出码 ${code}`).slice(0,250)))});
 });
}
let compiler:Promise<string>|undefined;
async function nativeBinary(){
 if(platform()!=='darwin')throw new Error('当前系统不支持 macOS 原生 OCR，请配置视觉 API');
 const source=resolve('scripts/ocr.swift'),binary=resolve('work/ocr-native');
 await mkdir('work',{recursive:true,mode:0o700});
 try{const [a,b]=await Promise.all([stat(source),stat(binary)]);if(b.mtimeMs>=a.mtimeMs)return binary;}catch{}
 compiler??=command('/usr/bin/swiftc',[source,'-o',binary],90000).then(()=>binary).finally(()=>{compiler=undefined});
 return compiler;
}
export async function localOcr(bytes:Buffer,mime:string){
 if(!/^image\/(png|jpeg|webp)$/.test(mime))throw new Error('本地 OCR 不支持此图片格式');
 const binary=await nativeBinary();const dir=await mkdtemp(join(tmpdir(),'kb-ocr-'));const path=join(dir,mime==='image/png'?'input.png':mime==='image/webp'?'input.webp':'input.jpg');
 try{await writeFile(path,bytes,{mode:0o600});const result=await command(binary,[path],45000);if(!result.trim())throw new Error('图片中未识别到文字');return result;}finally{await rm(dir,{recursive:true,force:true});}
}
