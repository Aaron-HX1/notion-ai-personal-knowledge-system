import {renderTrendChart} from './trend-chart.js';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const svgIcon = name => `<svg class="icon" aria-hidden="true"><use href="#${name}"></use></svg>`;
function emptyState(symbol,title,description,action='',destination='import'){return `<div class="empty-state"><div class="empty-state-art">${svgIcon(symbol)}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>${action?`<button type="button" class="button button-secondary" data-go="${destination}">${escapeHtml(action)} ${svgIcon('arrow-up-right')}</button>`:''}</div>`;}
function applyTheme(theme){document.documentElement.dataset.theme=theme;const next=theme==='dark'?'浅色':'深色';$('#theme-toggle').innerHTML=svgIcon(theme==='dark'?'sun':'moon');$('#theme-toggle').setAttribute('aria-label',`切换到${next}模式`);$('#theme-toggle').title=`切换到${next}模式`;document.querySelector('meta[name=theme-color]').content=theme==='dark'?'#09090b':'#fafafa';}
try{applyTheme(localStorage.getItem('kb-theme')||'light');}catch{applyTheme('light');}
const navMedia=matchMedia('(max-width:760px)');
function syncNavAccessibility(){const hidden=navMedia.matches&&!document.body.classList.contains('nav-open');$('.sidebar').inert=hidden;$('.sidebar').setAttribute('aria-hidden',String(hidden));}
let navAnimation;
function animateNav(){clearTimeout(navAnimation);document.body.classList.add('nav-animating');navAnimation=setTimeout(()=>document.body.classList.remove('nav-animating'),240);}
function closeNav(){if(document.body.classList.contains('nav-open'))animateNav();document.body.classList.remove('nav-open');$('#nav-toggle').setAttribute('aria-expanded','false');syncNavAccessibility();}
navMedia.addEventListener('change',()=>{clearTimeout(navAnimation);document.body.classList.remove('nav-open','nav-animating');$('#nav-toggle').setAttribute('aria-expanded','false');syncNavAccessibility();});syncNavAccessibility();
let pendingConfirmation;
function confirmAction(title,message){return new Promise(resolve=>{pendingConfirmation=resolve;$('#confirm-title').textContent=title;$('#confirm-message').textContent=message;$('#confirm-dialog').showModal();});}
function finishConfirmation(value){$('#confirm-dialog').close();const resolve=pendingConfirmation;pendingConfirmation=null;resolve?.(value);}
const safeLink = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const href = (url, label = '在 Notion 打开 ↗') => { const safe = safeLink(url); return safe ? `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>` : ''; };
const date = value => value ? new Date(value).toLocaleString('zh-CN') : '—';
const state = {view:'home', collection:null, collections:[], resources:[], settings:null, search:'', offset:0, watching:new Set(), weeklyReport:null};
async function api(path, options = {}) {
  const init = {credentials:'same-origin', ...options, headers:{...(options.body instanceof FormData ? {} : options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {})}};
  let response = await fetch(path, init);
  if (response.status === 401) {
    const failure = await response.clone().json().catch(() => ({}));
    if (failure.code === 'ui_session_expired') {
      await fetch('/', {credentials:'same-origin', cache:'no-cache'});
      response = await fetch(path, init);
    }
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data;
}
function toast(message, error = false) {
  const item = document.createElement('div'); item.className = `toast${error ? ' error' : ''}`;item.setAttribute('role',error?'alert':'status');
  item.innerHTML=`${svgIcon(error?'circle-help':'check')}<span class="toast-message">${escapeHtml(message)}</span><button type="button" class="toast-dismiss" aria-label="关闭通知">${svgIcon('x')}</button>`;
  const dismiss=()=>{item.classList.add('leaving');setTimeout(()=>item.remove(),180);};item.querySelector('button').addEventListener('click',dismiss);$('#toast-stack').append(item);setTimeout(dismiss,5200);
}
function busy(form, running) { const button = $('button[type=submit]', form); if (button) button.disabled = running; form.classList.toggle('busy', running); }
function view(name) {
  closeNav();
  state.view = name;
  $$('.view').forEach(x => x.classList.toggle('active', x.id === `view-${name}`));
  $$('.nav-item[data-view]').forEach(x => x.classList.toggle('active', x.dataset.view === name));
  const titles = {home:'概览',import:'导入资料',library:'资料库',ask:'知识问答',collections:'专题',review:'资料打分与复盘',weekly:'周末复盘中心',jobs:'任务记录',settings:'设置与备份',guide:'使用指南'};
  $('#current-view-title').textContent = titles[name] || name;
  if (name === 'home') {loadHome();loadTrends();} if (name === 'library') {loadFilters();loadResources(true);} if (name === 'jobs') loadJobs();
  if (name === 'collections') loadCollections(); if (name === 'settings') loadSettings(); if(name==='guide')loadGuide(); if(name==='ask')loadAskOptions();if(name==='review')loadReviews();
  window.scrollTo({top:0,behavior:'smooth'});
}
let homeRefreshTimer;
async function loadHome() {
 clearTimeout(homeRefreshTimer);homeRefreshTimer=null;
  try {
    const {system,resources,jobs,collections,initializing,initialized,error,notion} = await api('/api/home');
    if($('#notion-connection'))$('#notion-connection').textContent=notion==='ready'?'Notion 已连接':notion==='error'?'Notion 连接待检查':'Notion 后台连接中';
    if(error)$('#boot-state').textContent='后台初始化异常，请到设置检查连接';else $('#boot-state').textContent=initializing?'本地索引正在准备，界面已就绪':'';
    if(!initialized&&initializing){homeRefreshTimer=setTimeout(loadHome,500);return;}
    $('#stat-resources').textContent = system.resource_count; $('#stat-done').textContent = system.jobs.done || 0;
    $('#stat-pending').textContent = (system.jobs.queued || 0) + (system.jobs.running || 0);
    $('#stat-collections').textContent = collections.collections.length;
    $('#recent-resources').innerHTML = resources.resources.length ? resources.resources.map(r => `<a class="list-row" href="${escapeHtml(safeLink(r.notion_url))}" target="_blank" rel="noopener noreferrer"><span><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(r.category || r.type || '资料')}</small></span><span>↗</span></a>`).join('') : emptyState('inbox','从第一条资料开始','收藏网页、笔记或文件，让知识有处可寻。','导入资料');
    $('#recent-jobs').innerHTML = jobs.jobs.length ? jobs.jobs.map(j => `<div class="list-row"><span><strong>${escapeHtml(jobKind(j.kind))}</strong><small>${date(j.created_at)}</small></span><span class="status-pill ${escapeHtml(j.status)}">${escapeHtml(jobStatus(j.status))}</span></div>`).join('') : emptyState('activity','一切井然有序','新的导入、总结与导出任务会出现在这里。');
  } catch (e) { toast(e.message, true); } finally {document.documentElement.classList.add('app-ready');if(!document.documentElement.dataset.homeReadyMs)document.documentElement.dataset.homeReadyMs=performance.now().toFixed(1);if(!homeRefreshTimer)homeRefreshTimer=setTimeout(()=>{homeRefreshTimer=null;if(state.view==='home'&&!document.hidden)loadHome();},5000);}
}
const jobKind = kind => ({import:'资料导入',export:'专题导出',summarize:'专题总结'})[kind] || kind;
const jobStatus = status => ({queued:'排队中',running:'处理中',done:'已完成',failed:'失败'})[status] || status;
function feedback(html) { $('#import-feedback').innerHTML = html; }
const stageLabels={queued:'等待处理',fetching:'抓取中',dedupe:'检查重复',analyzing:'AI 分析中',writing:'写入 Notion',indexing:'更新索引',exporting:'打包中',done:'完成',failed:'失败'};
function progressHtml(stage){const order=['fetching','analyzing','writing','done'];const n=stage==='dedupe'?0:stage==='indexing'?2:Math.max(0,order.indexOf(stage));return `<div class="progress-track">${order.map((step,i)=>`<span class="progress-step ${stage==='done'||i<n?'done':i===n?'active':''}">${stageLabels[step]}</span>`).join('')}</div>`;}
function watchJob(id, target = 'import', onFinished = null) {
  state.watching.add(id);
  const poll = async () => {
    try {
      const job = await api(`/api/jobs/${encodeURIComponent(id)}`);
      if (target === 'import') feedback(`<span class="feedback-icon">✦</span><strong>${escapeHtml(stageLabels[job.stage]||jobStatus(job.status))}</strong>${progressHtml(job.stage||job.status)}<p>${escapeHtml(job.error || `任务编号 ${id.slice(0,8)}`)}</p>${job.result?.notion_url ? href(job.result.notion_url,'打开 Notion 页面 ↗') : ''}`);
      if (job.status === 'done' || job.status === 'failed') {
        state.watching.delete(id);
        onFinished?.(job.status === 'done',job);
        if (job.status === 'failed') toast(job.error || '处理失败', true);
        else { toast('任务已完成'); if (job.kind === 'export') {
          const d = await api(`/api/export/${encodeURIComponent(id)}/download`); const link = safeLink(new URL(d.url, location.origin).href);
          if (target === 'collection' && link) $('#collection-feedback').innerHTML = `<a class="button button-primary" href="${escapeHtml(link)}">下载 ZIP 归档包 ↓</a>`;
        } }
        if (state.view === 'home') loadHome(); if (state.view === 'jobs') loadJobs(); if (state.view === 'library') loadResources(true); if (state.view === 'collections' && job.kind !== 'export') loadCollections(state.collection);
      } else setTimeout(poll, 1200);
    } catch (e) { state.watching.delete(id); onFinished?.(false); toast(e.message, true); }
  }; poll();
}
let undoImport=null;
function importSnapshot(form){return {form, fields:[...form.querySelectorAll('input,textarea,select')].map(el=>({el,value:el.type==='file'?Array.from(el.files||[]):el.value,checked:el.checked})),review:reviewDefaults()};}
function sameSnapshot(s){return s.fields.every(x=>x.el.type==='file'?Array.from(x.el.files||[]).length===x.value.length&&Array.from(x.el.files||[]).every((f,i)=>f===x.value[i]):x.el.value===x.value)&&JSON.stringify(reviewDefaults())===JSON.stringify(s.review);}
function finishImport(s,result=null,jobId=null){s.result=result;s.jobId=jobId;
 if(!sameSnapshot(s))return;
 undoImport=s;s.form.reset();$('#import-score').value='7';$('#import-note').value='';updateImportScore();$('#file-name').textContent='保留原文件，提取文字后写入 Notion';$('#import-undo').hidden=false;
}
$('#undo-import').addEventListener('click',async()=>{if(!undoImport)return;const s=undoImport;if(([...s.form.querySelectorAll('input,textarea')].some(e=>e.type==='file'?e.files?.length:e.value)||$('#import-note').value||Number($('#import-score').value)!==7)&&!await confirmAction('恢复之前的输入？','当前表单中的新输入将被替换。'))return;
 if(s.jobId&&s.result?.operation==='created'){try{await api(`/api/resources/${encodeURIComponent(s.result.resource_id)}`,{method:'DELETE',body:JSON.stringify({confirm:'DELETE',job_id:s.jobId})});toast('新建资料已移入 Notion 回收站');}catch(err){toast('未撤回资料：'+err.message,true);return;}}else toast('已保留已有资料；仅恢复输入');
 const tab=$(`[data-import-tab="${s.form.id.slice(5)}"]`);tab?.click();for(const x of s.fields){if(x.el.type==='file'){const transfer=new DataTransfer();x.value.forEach(f=>transfer.items.add(f));x.el.files=transfer.files;}else{x.el.value=x.value;x.el.checked=x.checked;}}
 $('#import-score').value=String(s.review.score);updateImportScore();$('#import-note').value=s.review.user_note;$('#import-reminder').checked=s.review.reminder;$('#file-name').textContent=$('#file-input').files[0]?.name||'保留原文件，提取文字后写入 Notion';undoImport=null;$('#import-undo').hidden=true;toast('已恢复刚才的输入');});
async function submitImport(form, path, payload, isFile = false) {
  const snapshot=importSnapshot(form);
  busy(form, true); feedback('<span class="feedback-icon">◷</span><strong>正在提交</strong><p>请稍候…</p>');
  try {
    const review=reviewDefaults();if(isFile){payload.append('score',String(review.score));payload.append('user_note',review.user_note);payload.append('reminder',String(review.reminder));}
    else payload={...payload,...review};
    const result = await api(path,{method:'POST',body:isFile?payload:JSON.stringify(payload)});
    if (result.status==='duplicate' && result.notion_url) { feedback(`<strong>资料已存在</strong><p>已命中本地 URL 索引，无需重复调用 AI。</p>${href(result.notion_url,'打开已有 Notion 页面 ↗')}`); toast('资料已存在，已返回原页面'); finishImport(snapshot,result); }
    else if (result.job_id) { feedback(`<strong>已加入任务队列</strong><p>任务 ${escapeHtml(result.job_id.slice(0,8))}，正在处理…</p>`); watchJob(result.job_id,'import',(ok,job)=>{if(ok)finishImport(snapshot,job.result,result.job_id)}); }
    else if (result.job_ids) { feedback(`<strong>已提交 ${result.job_ids.length} 条链接</strong><p>打开任务记录查看进度。</p>`); let remaining=result.job_ids.length,allSucceeded=true; result.job_ids.forEach(id => watchJob(id, 'batch',ok=>{allSucceeded&&=ok;if(--remaining===0&&allSucceeded)finishImport(snapshot)})); toast(`已提交 ${result.job_ids.length} 个任务`); }
    else if (result.results) { feedback(`<strong>ZIP 校验与导入完成</strong><p>${result.results.length} 条资料已处理。</p>${result.results.map(r => r.notion_url ? href(r.notion_url,'打开 Notion 页面 ↗') : '').join('<br>')}`); loadHome(); finishImport(snapshot); }
  } catch (e) { feedback(`<strong>提交失败</strong><p>${escapeHtml(e.message)}</p>`); toast(e.message, true); }
  finally { busy(form, false); }
}
const reviewStates=['待复盘 (Pending)','已复盘 (Reviewed)','已搁置 (Archived)'];
function reviewDefaults(){return {score:Number($('#import-score')?.value||7),user_note:$('#import-note')?.value||'',reminder:!!$('#import-reminder')?.checked};}
function priorityForUi(score){return score>=9?'🔥 P0-极高优 (必看/核心)':score>=7?'⭐ P1-重点关注':score>=5?'📌 P2-普通参考':'💤 P3-低优归档';}
async function loadReviews(){try{const {resources}=await api('/api/reviews?limit=200');$('#review-list').innerHTML=resources.length?resources.map(r=>`<article class="panel review-row" data-review-id="${escapeHtml(r.id)}"><div class="review-row-title"><div><h2>${escapeHtml(r.title)}</h2><p>${escapeHtml(r.priority_level||(r.score?priorityForUi(r.score):'尚未评分'))} · ${r.reminder_date?`提醒 ${escapeHtml(String(r.reminder_date).slice(0,10))}`:'未设提醒'} · ${r.score_updated_at?`评分更新 ${date(r.score_updated_at)}`:''}</p></div>${href(r.notion_url,'打开 Notion ↗')}</div><div class="review-edit-grid"><label>评分（1–10）<input data-review-score type="number" min="1" max="10" step="1" value="${Number(r.score)||7}"><small data-review-priority>${escapeHtml(priorityForUi(Number(r.score)||7))}</small></label><label>提醒日期<input data-review-date type="date" value="${escapeHtml(String(r.reminder_date||'').slice(0,10))}"></label><label>复盘状态<select data-review-status>${reviewStates.map(x=>`<option value="${escapeHtml(x)}" ${x===(r.review_status||reviewStates[0])?'selected':''}>${escapeHtml(x)}</option>`).join('')}</select></label><label class="review-note">亮点备注 / 打分理由<textarea data-review-note rows="2" maxlength="10000">${escapeHtml(r.user_note||'')}</textarea></label></div><div class="review-row-actions"><button type="button" class="button button-secondary" data-save-review>保存并同步 Notion</button><span class="muted" data-review-feedback></span></div></article>`).join(''):'<div class="panel">'+emptyState('star','给知识一点优先级','导入时打个分，值得关注的资料会在这里汇集。','导入并评分')+'</div>';}catch(e){toast(e.message,true);}}
async function generateWeekly(){const button=$('#generate-weekly');button.disabled=true;$('#weekly-status').textContent='正在整理本周评分并生成分层报告…';try{const report=await api('/api/reviews/weekly',{method:'POST',body:'{}'});state.weeklyReport=report;$('#weekly-report').innerHTML=await renderMarkdown(report.report);$('#archive-weekly').disabled=!report.items.length;$('#mark-weekly-reviewed').disabled=!report.items.length;$('#weekly-status').textContent=`${report.items.length?`${report.items.length} 条资料 · ${report.ai_enhanced?'AI 已生成分层分析':'来源摘要模式（Mock 或 AI 输出不符合格式）'}`:'本周暂无评分或到期资料'} · ${report.week_start} 至 ${report.week_end}`;toast('本周复盘报告已生成');}catch(e){$('#weekly-status').textContent=e.message;toast(e.message,true);}finally{button.disabled=false;}}
async function loadResources(reset = false) {
  if (reset) { state.offset = 0; state.resources = []; }
  try {
    const filters=new URLSearchParams({limit:'30',offset:String(state.offset),q:state.search,sort:$('#library-sort').value,status:$('#library-status').value,category:$('#library-category').value,tag:$('#library-tag').value});const result = await api(`/api/resources?${filters}`);
    state.resources.push(...result.resources); state.offset += result.resources.length;
    $('#resource-count').textContent = `${state.resources.length} 条`;
    $('#resource-list').innerHTML = state.resources.length ? state.resources.map(r => `<article class="resource-card"><button type="button" class="text-button" data-resource="${escapeHtml(r.notion_id)}"><span class="type-pill">${escapeHtml(r.category || r.type || '资料')}</span><h3>${escapeHtml(r.title)}</h3><p>${escapeHtml((r.summary || '').slice(0,105))}</p><small>${r.score||'—'} 分 · ${escapeHtml(r.learning_status||'待学习')} · ${date(r.updated_at)}</small></button><div class="resource-actions"><button type="button" class="button button-secondary" data-learning="待学习" data-id="${escapeHtml(r.notion_id)}">↩️ 待学习</button><button type="button" class="button button-secondary" data-learning="已学习" data-id="${escapeHtml(r.notion_id)}">✅ 已学习</button><button type="button" class="button button-secondary" data-learning="已部署" data-id="${escapeHtml(r.notion_id)}">🚀 已部署</button><button type="button" class="button button-secondary" data-archive="${escapeHtml(r.notion_id)}">📦 归档</button><button type="button" class="button button-secondary" data-delete="${escapeHtml(r.notion_id)}">🗑️ 删除</button></div></article>`).join('') : emptyState('search','没有找到匹配资料','换个关键词，或先收藏一条值得回看的内容。','导入资料');
    $('#load-more-resources').hidden = result.resources.length < 30;
  } catch (e) { toast(e.message, true); }
}
async function resourceDetail(id) {
  try { const r = await api(`/api/resources/${encodeURIComponent(id)}`);
    $('#resource-detail').innerHTML = `<span class="type-pill">${escapeHtml(r.category || r.type)}</span><h2>${escapeHtml(r.title)}</h2><p>${escapeHtml(r.summary)}</p><p><strong>标签</strong><br>${escapeHtml((r.tags || []).join(' · ') || '无')}</p><p><strong>来源</strong><br>${r.source_url ? href(r.source_url, r.source_url) : escapeHtml(r.source_name)}</p><p>${href(r.notion_url,'打开 Notion 页面 ↗')}</p><strong>原始内容</strong><pre>${escapeHtml(r.body || '')}</pre>`;
  } catch (e) { toast(e.message, true); }
}
async function loadJobs() {
  try { const {jobs} = await api('/api/jobs?limit=100');
    $('#jobs-list').innerHTML = jobs.length ? jobs.map(j => `<div class="job-row"><div class="job-main"><strong>${escapeHtml(jobKind(j.kind))} <span class="status-pill ${escapeHtml(j.status)}">${escapeHtml(jobStatus(j.status))}</span></strong><small>${date(j.created_at)} · ${escapeHtml(j.id.slice(0,8))} · ${escapeHtml(stageLabels[j.stage]||'')} · 重试 ${j.retries || 0} 次</small>${j.error ? `<p class="job-error">${escapeHtml(j.error)}</p>` : ''}${j.result?.notion_url ? `<p>${href(j.result.notion_url,'打开 Notion 页面 ↗')}</p>` : ''}</div><div class="job-actions">${j.status === 'failed' ? `<button class="button button-secondary" data-retry="${escapeHtml(j.id)}">重试</button>` : ''}${j.kind === 'export' && j.status === 'done' ? `<button class="button button-secondary" data-download="${escapeHtml(j.id)}">下载 ZIP</button>` : ''}</div></div>`).join('') : emptyState('activity','一切井然有序','新的导入、总结与导出任务会出现在这里。');
  } catch (e) { toast(e.message, true); }
}
async function loadCollections(preferred = null) {
  try { const {collections,syncing} = await api('/api/collections'); state.collections = collections;if(syncing&&state.view==='collections')setTimeout(()=>{if(state.view==='collections')loadCollections(state.collection);},1500);
    $('#collection-count').textContent = collections.length;
    if (preferred) state.collection = preferred;
    if (state.collection && !collections.some(c => c.id === state.collection)) state.collection = null;
    $('#collection-list').innerHTML = collections.length ? collections.map(c => `<button type="button" class="collection-item ${c.id === state.collection ? 'active' : ''}" data-collection="${escapeHtml(c.id)}"><strong>${escapeHtml(c.title)}</strong><small>${(c.resource_ids || []).length} 条资料 · ${escapeHtml(c.status || '进行中')}</small></button>`).join('') : emptyState('folders','创建第一个专题','把散落的资料，组织成清晰的知识脉络。');
    if (state.collection) await collectionDetail(state.collection);
  } catch (e) { toast(e.message, true); }
}
async function collectionDetail(id) {
  state.collection = id; const c = state.collections.find(x => x.id === id); if (!c) return;
  $$('.collection-item').forEach(x => x.classList.toggle('active', x.dataset.collection === id));
  const indexed = await api('/api/resources?limit=100');
  const byId = new Map(indexed.resources.map(r => [r.notion_id, r]));
  $('#collection-detail').innerHTML = `<span class="type-pill">${escapeHtml(c.sharing_status || '私有')}</span><h2>${escapeHtml(c.title)}</h2><p>${escapeHtml(c.description || '暂无说明')}</p><p>${href(c.url,'打开 Notion 专题 ↗')}</p><div class="collection-actions"><button class="button button-primary" data-collection-action="summarize">✳ 生成跨资料总结</button><button class="button button-secondary" data-collection-action="export">↓ 打包 ZIP</button></div><div id="collection-feedback" class="muted"></div><h3>专题资料（${(c.resource_ids || []).length}）</h3>${(c.resource_ids || []).map(id => `<div class="collection-resource">${href(byId.get(id)?.notion_url || '',byId.get(id)?.title || id)}</div>`).join('') || '<p class="muted">尚未关联资料。</p>'}<div class="help-divider"></div><h3>添加资料</h3><div id="collection-choices">${indexed.resources.filter(r => !(c.resource_ids || []).includes(r.notion_id)).map(r => `<label class="collection-resource"><input type="checkbox" value="${escapeHtml(r.notion_id)}">${escapeHtml(r.title)}</label>`).join('') || '<p class="muted">没有可添加的资料。</p>'}</div><button type="button" class="button button-secondary" id="add-resources">添加选中资料</button><div class="help-divider"></div><h3>专题摘要</h3><p>${escapeHtml(c.summary || '尚未生成')}</p>`;
}
async function loadSettings() {
  try { const [system, settings] = await Promise.all([api('/api/system'), api('/api/settings')]); state.settings = settings;
    $('#setting-db').textContent = system.mode === 'local' ? 'PGlite · 本地持久化' : 'PostgreSQL';
    $('#setting-storage').textContent = system.storage === 'local' ? '本地文件' : 'S3';
    $('#setting-ai').textContent = settings.provider==='mock'?'模拟 AI':`${settings.provider} / ${settings.model}`;
    $('#setting-path').textContent = system.local_storage_dir || '—';
    $('#ai-provider').value=settings.provider;$('#ai-model').value=settings.provider==='mock'?'':settings.model;
    $('#reasoning-model').value=settings.provider==='mock'?'':settings.reasoning_model;
    $('#ai-base-url').value=settings.base_url||'';
    $('#ocr-engine').value=settings.ocr_engine;$('#ocr-model').value=settings.ocr_model;$('#ocr-base-url').value=settings.ocr_base_url||'';
    $('#storage-dir').value=settings.storage_dir;
    $('#key-status').textContent=`DeepSeek ${settings.deepseek_key_configured?'已配置':'未配置'} · OpenAI ${settings.openai_key_configured?'已配置':'未配置'} · 自定义 ${settings.custom_key_configured?'已配置':'未配置'} · 视觉 ${settings.ocr_key_configured?'已配置':'未配置'}`;
    $('#saved-secrets').replaceChildren(...Object.entries(settings.secrets||{}).map(([key,status])=>{const row=document.createElement('div');row.className='settings-row';const text=document.createElement('span');text.textContent=key+' · '+(status.configured?status.masked:'未配置');const button=document.createElement('button');button.type='button';button.className='button button-secondary';button.textContent='删除密钥';button.disabled=!status.configured;button.addEventListener('click',async()=>{if(!await confirmAction('确认删除 '+key+'？','将同时从 .env 和本地备份清空此密钥。删除 Notion 或控制台 Token 后，重启需要重新配置。'))return;try{await api('/api/settings/delete-secret',{method:'POST',body:JSON.stringify({key,confirm:'DELETE'})});toast('密钥已删除');await loadSettings();}catch(err){toast(err.message,true);}});row.append(text,button);return row;}));
    $('#notion-key-status').textContent=settings.notion_token_configured?'Notion Token 已配置（不会回显）':'尚未配置 Notion Token';
    $('#icloud-status').textContent = settings.icloud_available ? '已检测到本机 iCloud Drive' : '未检测到 iCloud Drive，请先在 macOS 登录并启用';
    $('#mock-warning').hidden = settings.provider!=='mock';
    updateProviderUi(false);
  } catch (e) { toast(e.message, true); }
}
function updateProviderUi(changed){
  const provider=$('#ai-provider').value;
  $('#label-deepseek-key').hidden=provider!=='deepseek';$('#label-openai-key').hidden=provider!=='openai';$('#label-custom-key').hidden=provider!=='custom';
  if(changed){
    if(provider==='deepseek'){$('#ai-base-url').value='https://api.deepseek.com';$('#ai-model').value='deepseek-flash';$('#reasoning-model').value='deepseek-v4-pro';}
    else if(provider==='openai'){$('#ai-base-url').value='';$('#ai-model').value='gpt-4.1-mini';$('#reasoning-model').value='gpt-4.1-mini';}
    else if(provider==='custom'){$('#ai-base-url').value='http://localhost:11434/v1';$('#ai-model').value='';$('#reasoning-model').value='';}
    else{$('#ai-base-url').value='';$('#ai-model').value='';$('#reasoning-model').value='';}
  }
}
async function renderMarkdown(markdown){const renderer=await import('/markdown.js');return renderer.renderMarkdown(markdown);}
async function loadGuide(kind='user'){$$('[data-guide]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.guide===kind)));try{const r=await api('/api/guide?kind='+encodeURIComponent(kind));$('#guide-content').innerHTML=await renderMarkdown(r.markdown);}catch(e){$('#guide-content').textContent=e.message;}}
async function loadAskOptions(){try{const r=await api('/api/resources?limit=100');const categories=[...new Set(r.resources.map(x=>x.category).filter(Boolean))].sort();$('#ask-category').innerHTML='<option value="">全部分类</option>'+categories.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');}catch(e){toast(e.message,true);}}
async function syncIndex() { $('#sync-feedback').textContent = '正在同步…'; try { const r = await api('/api/index/rebuild',{method:'POST',body:'{}'}); $('#sync-feedback').textContent = `同步完成：${JSON.stringify(r)}`; toast('索引同步完成'); loadHome(); } catch(e) { $('#sync-feedback').textContent = e.message; toast(e.message,true); } }

document.addEventListener('click', async e => {
  const learning=e.target.closest('[data-learning]');if(learning){try{await api(`/api/resources/${encodeURIComponent(learning.dataset.id)}/learning`,{method:'PATCH',body:JSON.stringify({status:learning.dataset.learning})});toast('状态已同步 Notion');loadResources(true);loadTrends();}catch(err){toast(err.message,true);}return;}
  const archive=e.target.closest('[data-archive]');if(archive){if(!await confirmAction('归档资料？','资料会在 Notion 标记为已搁置，仍可查看。'))return;try{await api(`/api/resources/${encodeURIComponent(archive.dataset.archive)}/archive`,{method:'POST',body:'{}'});toast('已归档');loadResources(true);}catch(err){toast(err.message,true);}return;}
  const del=e.target.closest('[data-delete]');if(del){if(!await confirmAction('删除资料？','资料将移入 Notion 回收站，本地索引将移除。可在 Notion 中恢复。'))return;try{await api(`/api/resources/${encodeURIComponent(del.dataset.delete)}`,{method:'DELETE',body:JSON.stringify({confirm:'DELETE'})});toast('已移入 Notion 回收站');loadResources(true);}catch(err){toast(err.message,true);}return;}
  const guide=e.target.closest('[data-guide]');if(guide){await loadGuide(guide.dataset.guide);return;}
  const nav = e.target.closest('[data-view],[data-go]'); if (nav) { view(nav.dataset.view || nav.dataset.go); return; }
  const tab = e.target.closest('[data-import-tab]'); if (tab) { $$('.import-tab').forEach(x => x.classList.toggle('active',x === tab)); $$('.import-form').forEach(x => x.classList.toggle('active',x.id === `form-${tab.dataset.importTab}`)); return; }
  const resource = e.target.closest('[data-resource]'); if (resource) { resourceDetail(resource.dataset.resource); return; }
  const collection = e.target.closest('[data-collection]'); if (collection) { collectionDetail(collection.dataset.collection); return; }
  const retry = e.target.closest('[data-retry]'); if (retry) { try { await api(`/api/jobs/${retry.dataset.retry}/retry`,{method:'POST',body:'{}'}); toast('已重新排队'); loadJobs(); watchJob(retry.dataset.retry,'batch'); } catch(err) { toast(err.message,true); } return; }
  const download = e.target.closest('[data-download]'); if (download) { try { const r = await api(`/api/export/${download.dataset.download}/download`); location.href = r.url; } catch(err) { toast(err.message,true); } return; }
  const action = e.target.closest('[data-collection-action]'); if (action) { try { $('#collection-feedback').textContent = '已提交任务，正在处理…'; const r = action.dataset.collectionAction === 'export' ? await api('/api/export/collection',{method:'POST',body:JSON.stringify({id:state.collection})}) : await api(`/api/collections/${state.collection}/summarize`,{method:'POST',body:'{}'}); watchJob(r.job_id,'collection'); } catch(err) { toast(err.message,true); } return; }
  if (e.target.id === 'add-resources') { const ids = $$('#collection-choices input:checked').map(x => x.value); if (!ids.length) return toast('请先勾选资料',true); try { await api(`/api/collections/${state.collection}/resources`,{method:'POST',body:JSON.stringify({resource_ids:ids})}); toast('资料已关联'); await loadCollections(state.collection); } catch(err) { toast(err.message,true); } return; }
});
$('#form-url').addEventListener('submit', e => { e.preventDefault(); const f=e.currentTarget, d=Object.fromEntries(new FormData(f)); submitImport(f,'/api/import/url',{url:d.url,title:d.title||undefined,body:d.body||undefined,duplicate:d.duplicate}); });
$('#form-github').addEventListener('submit', e => { e.preventDefault(); const f=e.currentTarget,d=Object.fromEntries(new FormData(f)); submitImport(f,'/api/import/github',{url:d.url}); });
$('#form-text').addEventListener('submit', e => { e.preventDefault(); const f=e.currentTarget,d=Object.fromEntries(new FormData(f)); submitImport(f,'/api/import/text',{title:d.title,body:d.body}); });
$('#form-file').addEventListener('submit', e => { e.preventDefault(); const f=e.currentTarget; submitImport(f,'/api/import/file',new FormData(f),true); });
$('#form-batch').addEventListener('submit', e => { e.preventDefault(); const f=e.currentTarget; const items=String(new FormData(f).get('urls')).split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(url=>({kind:/^https:\/\/github\.com\//i.test(url)?'github':'url',url})); if (!items.length || items.length>100) return toast('请输入 1–100 条链接',true); submitImport(f,'/api/import/batch',{items}); });
$('#form-zip').addEventListener('submit', e => { e.preventDefault(); const f=e.currentTarget,fd=new FormData(f); const strategy=fd.get('duplicate'); fd.delete('duplicate'); submitImport(f,`/api/import/archive?duplicate=${encodeURIComponent(strategy)}`,fd,true); });
$('#file-input').addEventListener('change',e=>$('#file-name').textContent=e.target.files[0]?.name || '保留原文件，提取文字后写入 Notion');
for(const name of ['dragenter','dragover']) $('#file-dropzone').addEventListener(name,e=>{e.preventDefault();e.currentTarget.classList.add('dragging')});
for(const name of ['dragleave','drop']) $('#file-dropzone').addEventListener(name,e=>{e.preventDefault();e.currentTarget.classList.remove('dragging')});
$('#file-dropzone').addEventListener('drop',e=>{ const files=e.dataTransfer.files; if(files.length){$('#file-input').files=files;$('#file-name').textContent=files[0].name;}});
function updateImportScore(){const range=$('#import-score'),score=Number(range.value);$('#import-score-value').value=score;$('#import-priority').textContent=priorityForUi(score);$('#import-priority').dataset.level=score>=9?'p0':score>=7?'p1':score>=5?'p2':'p3';range.style.setProperty('--range-progress',`${(score-1)/9*100}%`);range.setAttribute('aria-valuetext',`${score} 分，${priorityForUi(score)}`);$('#import-reminder').checked=score>=9;}
$('#import-score').addEventListener('input',updateImportScore);updateImportScore();
$('#review-list').addEventListener('input',e=>{if(e.target.matches('[data-review-score]'))e.target.closest('.review-row').querySelector('[data-review-priority]').textContent=priorityForUi(Number(e.target.value)||7);});
$('#review-list').addEventListener('click',async e=>{const button=e.target.closest('[data-save-review]');if(!button)return;const row=button.closest('.review-row'),id=row.dataset.reviewId;button.disabled=true;row.querySelector('[data-review-feedback]').textContent='正在同步 Notion…';try{await api(`/api/resources/${encodeURIComponent(id)}/review`,{method:'PATCH',body:JSON.stringify({score:Number(row.querySelector('[data-review-score]').value),user_note:row.querySelector('[data-review-note]').value,reminder_date:row.querySelector('[data-review-date]').value||null,review_status:row.querySelector('[data-review-status]').value})});row.querySelector('[data-review-feedback]').textContent='已同步';toast('评分与复盘状态已同步到 Notion');}catch(err){row.querySelector('[data-review-feedback]').textContent=err.message;toast(err.message,true);}finally{button.disabled=false;}});
$('#refresh-reviews').addEventListener('click',loadReviews);$('#generate-weekly').addEventListener('click',generateWeekly);
$('#archive-weekly').addEventListener('click',async()=>{if(!state.weeklyReport)return;try{const r=await api('/api/reviews/weekly/archive',{method:'POST',body:JSON.stringify({id:state.weeklyReport.id})});$('#weekly-status').innerHTML=`已归档到 Collections：${href(r.url,r.title)}`;toast('周报已同步为 Notion 私有专题');}catch(e){toast(e.message,true);}});
$('#mark-weekly-reviewed').addEventListener('click',async()=>{if(!state.weeklyReport)return;const button=$('#mark-weekly-reviewed');button.disabled=true;try{const r=await api('/api/reviews/weekly/mark-reviewed',{method:'POST',body:JSON.stringify({id:state.weeklyReport.id})});$('#weekly-status').textContent=`${r.updated} 条资料已标记为已复盘`;toast('本周项目已标记为已复盘');}catch(e){toast(e.message,true);button.disabled=false;}});
let searchTimer; $('#resource-search').addEventListener('input',e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.search=e.target.value.trim();loadResources(true)},220)});
$('#load-more-resources').addEventListener('click',()=>loadResources());
$('#refresh-jobs').addEventListener('click',loadJobs);
$('#library-sync').addEventListener('click',syncIndex); $('#settings-sync').addEventListener('click',syncIndex);
$('#form-ask').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget, values=new FormData(f), question=String(values.get('question')).trim();if(!question)return;busy(f,true);$('#ask-result').insertAdjacentHTML('beforeend',`<div class="chat-bubble user">${escapeHtml(question)}</div>`);try{const r=await api('/api/ask',{method:'POST',body:JSON.stringify({question,category:values.get('category')||undefined,tags:String(values.get('tags')||'').split(/[,，]/).map(x=>x.trim()).filter(Boolean)})});$('#ask-result').insertAdjacentHTML('beforeend',`<div class="chat-bubble assistant">${escapeHtml(r.answer)}${(r.citations||[]).map(c=>`<div class="citation-card">[${c.number}] ${href(c.notion_url,c.title)}<small>${escapeHtml(c.excerpt)}</small></div>`).join('')}</div>`);}catch(err){toast(err.message,true);}finally{busy(f,false);f.reset();}});
const dialog=$('#new-collection-dialog'); $('#new-collection-button').addEventListener('click',()=>dialog.showModal()); $('#close-collection-dialog').addEventListener('click',()=>dialog.close()); $('#cancel-collection-dialog').addEventListener('click',()=>dialog.close());
$('#form-create-collection').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,d=Object.fromEntries(new FormData(f));busy(f,true);try{const r=await api('/api/collections',{method:'POST',body:JSON.stringify(d)});dialog.close();f.reset();toast('专题已创建');await loadCollections(r.id);}catch(err){toast(err.message,true);}finally{busy(f,false)}});
$('#ai-provider').addEventListener('change',()=>updateProviderUi(true));
async function saveSettings(){const f=$('#form-settings'),d=Object.fromEntries(new FormData(f));busy(f,true);try{
  const payload={api_token:d.api_token||undefined,provider:d.provider,model:d.model,reasoning_model:d.reasoning_model,base_url:d.base_url||'',openai_api_key:d.openai_api_key||undefined,deepseek_api_key:d.deepseek_api_key||undefined,ai_api_key:d.ai_api_key||undefined,notion_token:d.notion_token||undefined,ocr_engine:d.ocr_engine,ocr_model:d.ocr_model||undefined,ocr_base_url:d.ocr_base_url||'',ocr_api_key:d.ocr_api_key||undefined,storage_dir:d.storage_dir};
  await api('/api/settings',{method:'POST',body:JSON.stringify(payload)});
  $$('input[type=password]',f).forEach(x=>x.value='');toast('设置已保存');await loadSettings();return true;
 }catch(err){toast(err.message,true);return false;}finally{busy(f,false);}}
$('#form-settings').addEventListener('submit',async e=>{e.preventDefault();await saveSettings()});
$('#ai-test').addEventListener('click',async()=>{const x=$('#ai-test-result');x.textContent='正在保存设置并测试…';if(!await saveSettings()){x.textContent='请先修正设置';return;}try{const r=await api('/api/settings/ai-test');x.textContent=r.message;toast(r.message);}catch(err){x.textContent=err.message;toast(err.message,true)}});
$('#use-icloud').addEventListener('click',()=>{if(!state.settings)return;$('#storage-dir').value=state.settings.icloud_suggested;toast('已填入 iCloud Drive 建议目录，请保存设置')});
$('#notion-test').addEventListener('click',async()=>{const x=$('#notion-test-result');x.textContent='正在检测…';try{const token=String($('input[name=notion_token]').value||'').trim();if(token){await api('/api/settings',{method:'POST',body:JSON.stringify({notion_token:token})});$('input[name=notion_token]').value='';}const r=await api('/api/settings/notion-test');x.textContent=r.message;toast(r.message)}catch(err){x.textContent=err.message;toast(err.message,true)}});
$('#stop-service').addEventListener('click',async()=>{if(!await confirmAction('停止本地服务','当前界面将停止连接。需要时，双击 KnowledgeBot.command 即可再次打开。'))return;try{await api('/api/system/stop',{method:'POST',body:'{}'});toast('服务正在停止，关闭此标签页即可')}catch(err){toast(err.message,true)}});
$('#theme-toggle').addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';applyTheme(theme);try{localStorage.setItem('kb-theme',theme);}catch{}});
$('#nav-toggle').addEventListener('click',()=>{animateNav();const open=document.body.classList.toggle('nav-open');$('#nav-toggle').setAttribute('aria-expanded',String(open));syncNavAccessibility();if(open)$('.sidebar .nav-item.active')?.focus();});
$('#nav-scrim').addEventListener('click',closeNav);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeNav();});
$('#confirm-accept').addEventListener('click',()=>finishConfirmation(true));$('#confirm-cancel').addEventListener('click',()=>finishConfirmation(false));$('#confirm-close').addEventListener('click',()=>finishConfirmation(false));$('#confirm-dialog').addEventListener('cancel',e=>{e.preventDefault();finishConfirmation(false);});
setTimeout(()=>document.documentElement.classList.add('app-ready'),1200);
loadHome();

document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.view==='home')loadHome();});

async function refreshQuota(){
 const buttons=[$('#quota-refresh'),$('#home-quota-refresh')];buttons.forEach(b=>b.disabled=true);
 $('#quota-status').textContent='正在查询…';$('#home-quota-status').textContent='正在查询…';
 try{const q=await api('/api/settings/quota');const value=`提供商：${q.provider} · `+(q.balances?.length?`${q.available?'连接成功':'余额不足'} · `+q.balances.map(b=>`${b.currency} ${b.total_balance}`).join(' / '):q.message||'余额不可用');$('#quota-status').textContent=value;$('#home-quota-status').textContent=value;}
 catch(err){$('#quota-status').textContent='查询失败：'+err.message;$('#home-quota-status').textContent='查询失败：'+err.message;}
 finally{buttons.forEach(b=>b.disabled=false);}
}
$('#quota-refresh').addEventListener('click',refreshQuota);$('#home-quota-refresh').addEventListener('click',refreshQuota);refreshQuota();

async function loadFilters(){try{const f=await api('/api/resource-filters');for(const [id,items,label] of [['library-category',f.categories,'全部分类'],['library-tag',f.tags,'全部标签']]){const el=$('#'+id),v=el.value;el.innerHTML=`<option value="">${label}</option>`+items.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');el.value=v;}}catch(e){toast(e.message,true);}}
for(const id of ['library-sort','library-status','library-category','library-tag'])$('#'+id).addEventListener('change',()=>loadResources(true));
let trendPeriod='day',trendRequest=0;
async function loadTrends(){const request=++trendRequest;try{const data=await api('/api/stats/trends?period='+trendPeriod);if(request!==trendRequest)return;$('#trend-chart').innerHTML=renderTrendChart(data.events);}catch(e){if(request===trendRequest)$('#trend-chart').textContent='统计加载失败：'+e.message;}}
for(const button of $$('[data-trend-period]'))button.addEventListener('click',()=>{trendPeriod=button.dataset.trendPeriod;$$('[data-trend-period]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));loadTrends();});
loadTrends();
