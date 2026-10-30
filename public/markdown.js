const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeLink = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const href = (url, label = '在 Notion 打开 ↗') => { const safe = safeLink(url); return safe ? `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>` : ''; };
function inlineMarkdown(text){return escapeHtml(text).replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,(_,label,url)=>href(url,label)).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');}
export function renderMarkdown(markdown){let html='',list='',code=false,codeLines=[];const lines=markdown.split(/\r?\n/);const close=()=>{if(list){html+=`</${list}>`;list='';}};
  for(let i=0;i<lines.length;i++){const line=lines[i];
    const image=line.match(/^!\[([^\]]*)\]\(((?:\/guide-assets\/|public\/guide-assets\/)[a-z0-9-]+\.svg)\)$/i);if(image&&!code){close();html+=`<figure><img src="${escapeHtml(image[2])}" alt="${escapeHtml(image[1])}" loading="lazy"><figcaption>${escapeHtml(image[1])}</figcaption></figure>`;continue;}
    if(line.startsWith('```')){if(code){html+=`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`;codeLines=[];code=false;}else{close();code=true;}continue;}
    if(code){codeLines.push(line);continue;}
    if(line.trim().startsWith('|')){close();const rows=[];while(i<lines.length&&lines[i].trim().startsWith('|')){const cells=lines[i].trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());if(!cells.every(x=>/^:?-{3,}:?$/.test(x)))rows.push(cells);i++;}i--;if(rows.length){html+='<table><thead><tr>'+rows[0].map(x=>`<th>${inlineMarkdown(x)}</th>`).join('')+'</tr></thead><tbody>'+rows.slice(1).map(r=>'<tr>'+rows[0].map((_,j)=>`<td>${inlineMarkdown(r[j]||'')}</td>`).join('')+'</tr>').join('')+'</tbody></table>';}continue;}
    const head=line.match(/^(#{1,3})\s+(.+)/);if(head){close();const n=head[1].length;html+=`<h${n}>${inlineMarkdown(head[2])}</h${n}>`;continue;}
    const bullet=line.match(/^\s*[-*]\s+(.+)/),number=line.match(/^\s*\d+\.\s+(.+)/);
    if(bullet||number){const type=bullet?'ul':'ol';if(list!==type){close();html+=`<${type}>`;list=type;}html+=`<li>${inlineMarkdown((bullet||number)[1])}</li>`;continue;}
    close();if(line.trim())html+=line.startsWith('>')?`<blockquote>${inlineMarkdown(line.slice(1).trim())}</blockquote>`:`<p>${inlineMarkdown(line)}</p>`;
  }close();return html;
}
