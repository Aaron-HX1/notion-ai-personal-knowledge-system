import {timingSafeEqual} from 'node:crypto';import {lookup} from 'node:dns/promises';import {lookup as dnsLookup} from 'node:dns';import {Agent,fetch as undiciFetch} from 'undici';import {isIP} from 'node:net';
export function privateIp(ip:string){const x=ip.toLowerCase();if(x.includes(':'))return x==='::1'||x.startsWith('fc')||x.startsWith('fd')||x.startsWith('fe8')||x.startsWith('fe9')||x.startsWith('fea')||x.startsWith('feb')||x.startsWith('::ffff:')||x==='::';const a=x.split('.').map(Number);return a[0]===0||a[0]===10||a[0]===127||a[0]>=224||a[0]===169&&a[1]===254||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&a[1]===168||a[0]===100&&a[1]>=64&&a[1]<=127||a[0]===192&&a[1]===0||a[0]===198&&a[1]>=18&&a[1]<=19;}
const proxyRange=(ip:string)=>ip.startsWith('198.18.0.');
export async function safeUrl(value:string,allowDnsProxyRange=false){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))throw new Error('不允许的 URL 协议、凭证或端口');u.hash='';u.hostname=u.hostname.toLowerCase();if(['localhost','metadata.google.internal'].includes(u.hostname)||u.hostname.endsWith('.local'))throw new Error('禁止访问内网主机');const ips=isIP(u.hostname)?[u.hostname]:(await lookup(u.hostname,{all:true,verbatim:true})).map(x=>x.address);if(!ips.length||ips.some(ip=>privateIp(ip)&&!(allowDnsProxyRange&&!isIP(u.hostname)&&proxyRange(ip))))throw new Error('禁止访问内网或云元数据地址');return u.toString();}
async function publicFetchOnce(value:string,max=2_000_000,allowDnsProxyRange=false){let url=await safeUrl(value,allowDnsProxyRange);for(let i=0;i<4;i++){const agent=new Agent({connect:{lookup:(hostname,options,callback)=>{dnsLookup(hostname,{all:true,verbatim:true},(err,addresses)=>{if(err)return callback(err,undefined as any,undefined as any);const allowed=addresses.filter(a=>!privateIp(a.address)||allowDnsProxyRange&&proxyRange(a.address));if(allowed.length!==addresses.length||!allowed.length)return callback(new Error('禁止访问内网地址'),undefined as any,undefined as any);if(options.all)callback(null,allowed as any,undefined as any);else callback(null,allowed[0].address,allowed[0].family);});}}});let r;try{r=await undiciFetch(url,{dispatcher:agent,redirect:'manual',headers:{'User-Agent':'PersonalKnowledgeImporter/1.0'},signal:AbortSignal.timeout(15000)});}catch(e){await agent.close();throw e;}if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();await agent.close();url=await safeUrl(new URL(r.headers.get('location')||'',url).toString(),allowDnsProxyRange);continue;}if(!r.ok){await r.body?.cancel();await agent.close();throw new Error(`来源 HTTP ${r.status}`);}const len=Number(r.headers.get('content-length')||0);if(len>max){await r.body?.cancel();await agent.close();throw new Error('来源内容超过大小限制');}const reader=r.body?.getReader();const chunks:Uint8Array[]=[];let size=0;if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();await agent.close();throw new Error('来源内容超过大小限制');}chunks.push(value);}await agent.close();return {url,contentType:r.headers.get('content-type')||'',bytes:Buffer.concat(chunks)};}throw new Error('重定向过多');}
export function authorized(header:string|undefined,token:string){if(!token)return false;const a=Buffer.from(header||''),b=Buffer.from('Bearer '+token);return a.length===b.length&&timingSafeEqual(a,b);}
export function exportDownloadAvailable(completedAt:Date,now=new Date()){return now.getTime()-completedAt.getTime()<24*60*60*1000&&now.getTime()>=completedAt.getTime();}

// Retry only bounded, idempotent public reads; every attempt repeats SSRF checks.
export function networkFailure(error:unknown):string{
 const codes:string[]=[];let current:any=error;
 for(let i=0;current&&i<5;i++,current=current.cause){if(typeof current.code==='string')codes.push(current.code);if(current.name==='TimeoutError')codes.push('TIMEOUT');}
 return [...new Set(codes)].join(', ')||'FETCH_FAILED';
}
export async function publicFetch(value:string,max=2_000_000,allowDnsProxyRange=false){
 for(let attempt=0;attempt<3;attempt++){
  try{return await publicFetchOnce(value,max,allowDnsProxyRange);}
  catch(error){
   const network=error instanceof TypeError&&error.message==='fetch failed'||error instanceof Error&&error.name==='TimeoutError';
   if(!network)throw error;
   if(attempt===2)throw new Error(`抓取 ${new URL(value).hostname} 网络连接失败（${networkFailure(error)}）。请检查网络或代理后重试。`,{cause:error});
   await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));
  }
 }
 throw new Error('抓取失败');
}
