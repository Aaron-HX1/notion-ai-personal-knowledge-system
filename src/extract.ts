import * as cheerio from 'cheerio';import mammoth from 'mammoth';import {PDFParse} from 'pdf-parse';import {publicFetch} from './security.js';import type {AI} from './ai.js';
export async function extractUrl(url:string,fallback?:{title?:string;body?:string},allowDnsProxyRange=false){
 try{
  const r=await publicFetch(url,2_000_000,allowDnsProxyRange);
  if(!r.contentType.includes('html'))throw new Error('网页不是 HTML');
  const $=cheerio.load(r.bytes.toString('utf8'));
  $('script,style,nav,footer,header,aside,svg,iframe,form,noscript,[role="navigation"],[aria-label="advertisement"],.advertisement,.ads,.cookie-banner').remove();
  $('[class*="advert"],[id*="advert"]').remove();
  const title=$('meta[property="og:title"]').attr('content')||$('title').first().text().trim()||fallback?.title||r.url;
  const description=$('meta[name="description"]').attr('content')?.trim()||'';
  $('h1,h2,h3,h4,p,li,blockquote,pre').each((_,el)=>{$(el).append('\n')});
  const main=$('article').first().length?$('article').first():$('main').first().length?$('main').first():$('body');
  const body=(description?`页面简介：${description}\n`:'' )+main.text().replace(/data:[^\s]+;base64,[A-Za-z0-9+/=]+/g,'[binary omitted]').replace(/[A-Za-z0-9+/]{300,}={0,2}/g,'[binary omitted]').replace(/[ \t]+/g,' ').replace(/\n[ \t]*\n+/g,'\n\n').trim();
  if(!body.trim())throw new Error('正文为空');
  return {title,body,source_name:new URL(r.url).hostname,url:r.url,type:'web'};
 }catch(e){if(fallback?.body)return {title:fallback.title||url,body:fallback.body,source_name:new URL(url).hostname,url,type:'web'};throw e;}
}
export async function extractGithub(value:string,allowDnsProxyRange=false){const u=new URL(value);if(u.hostname!=='github.com')throw new Error('仅支持 github.com 仓库');const [owner,repo]=u.pathname.split('/').filter(Boolean);if(!owner||!repo)throw new Error('仓库 URL 无效');const api=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo.replace(/\.git$/,''))}`;const r=await publicFetch(api,2_000_000,allowDnsProxyRange);const meta=JSON.parse(r.bytes.toString());if(meta.private||meta.message)throw new Error('公开仓库不可访问');let readme='';try{const rr=await publicFetch(`https://api.github.com/repos/${owner}/${repo}/readme`,2_000_000,allowDnsProxyRange);const j=JSON.parse(rr.bytes.toString());if(j.encoding==='base64')readme=Buffer.from(j.content.replace(/\s/g,''),'base64').toString('utf8');}catch{}return {title:meta.full_name,body:[`简介：${meta.description||''}\n主要语言：${meta.language||'未知'}\n主题：${(meta.topics||[]).join(', ')}\n许可证：${meta.license?.spdx_id||'未知'}\n默认分支：${meta.default_branch||''}\nStars：${meta.stargazers_count||0}`,readme].join('\n\n').slice(0,100000),source_name:'GitHub',url:meta.html_url,type:'github'};}
export async function extractFile(name:string,bytes:Buffer,ai:AI){const ext=name.toLowerCase().split('.').pop();if(!['png','jpg','jpeg','webp','pdf','docx','txt','md'].includes(ext||''))throw new Error('文件类型不支持');let body='';if(ext==='txt'||ext==='md')body=bytes.toString('utf8');else if(ext==='docx')body=(await mammoth.extractRawText({buffer:bytes})).value;else if(ext==='pdf'){const pdf=new PDFParse({data:bytes});try{body=(await pdf.getText()).text;if(!body.trim()){const shots=await pdf.getScreenshot({first:5,scale:1});body=(await Promise.all(shots.pages.map(p=>ai.ocr(Buffer.from(p.data),'image/png')))).join('\n\n');}}finally{await pdf.destroy();}}if(!body.trim()&&['png','jpg','jpeg','webp'].includes(ext||''))body=await ai.ocr(bytes,ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg');if(!body.trim())throw new Error('OCR 不可用或未提取到文本');return {title:name,body,source_name:'文件上传',type:ext==='pdf'?'pdf':ext==='docx'?'docx':['png','jpg','jpeg','webp'].includes(ext||'')?'image':'text'};}
