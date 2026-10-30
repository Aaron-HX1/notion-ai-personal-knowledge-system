const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const series=[['import','导入'],['learn','已学习'],['deploy','已部署']];
export function renderTrendChart(events){
 const points=new Map();
 for(const item of events||[]){const label=String(item.period||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(label)||!series.some(([key])=>key===item.kind))continue;if(!points.has(label))points.set(label,{import:0,learn:0,deploy:0});const value=Number(item.count);points.get(label)[item.kind]=Number.isFinite(value)&&value>0?value:0;}
 const rows=[...points].sort(([a],[b])=>a.localeCompare(b));const maximum=Math.max(0,...rows.flatMap(([,v])=>series.map(([key])=>v[key])));
 if(!maximum)return `<div class="trend-empty"><div class="trend-empty-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M10 34h28M14 29V19M24 29V12M34 29V22" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="34" cy="14" r="3" stroke="currentColor" stroke-width="2"/></svg></div><strong>暂无趋势数据</strong><span>导入资料或标记学习、部署后，这里会显示你的进展。</span></div>`;
 const ceiling=Math.max(4,Math.ceil(maximum/4)*4);
 const legend=series.map(([key,name])=>`<span><i class="trend-dot ${key}"></i>${name}</span>`).join('');
 const ticks=Array.from({length:5},(_,i)=>`<span>${ceiling*(4-i)/4}</span>`).join('');
 const groups=rows.map(([date,v])=>{const label=escapeHtml(date);const description=series.map(([key,name])=>`${name} ${v[key]}`).join('，');return `<div class="trend-group" tabindex="0" role="img" aria-label="${label}，${description}"><div class="trend-columns">${series.map(([key,name])=>`<span class="trend-column ${key}" style="height:${v[key]/ceiling*100}%" aria-label="${name} ${v[key]}"></span>`).join('')}</div><span class="trend-date">${label}</span><div class="trend-tooltip" role="tooltip"><strong>${label}</strong>${series.map(([key,name])=>`<span><i class="trend-dot ${key}"></i>${name}<b>${v[key]}</b></span>`).join('')}</div></div>`;}).join('');
 return `<div class="trend-legend">${legend}</div><div class="trend-scroll"><div class="trend-plot"><div class="trend-y-axis" aria-hidden="true">${ticks}</div><div class="trend-plot-main"><div class="trend-gridlines" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><div class="trend-groups">${groups}</div></div></div></div>`;
}
