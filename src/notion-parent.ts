export function notionParentId(value:string){
 let path=value.trim();if(/^https?:/i.test(path)){const u=new URL(path);if(!['notion.so','www.notion.so','notion.com','www.notion.com','app.notion.com'].includes(u.hostname)||u.protocol!=='https:')throw new Error('请填写 HTTPS Notion 父页面链接');path=u.pathname;}
 const match=path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})\/?$/i);if(!match)throw new Error('父页面链接中未找到页面 ID，请复制完整页面链接');const id=match[1].replaceAll('-','');return [id.slice(0,8),id.slice(8,12),id.slice(12,16),id.slice(16,20),id.slice(20)].join('-');
}
