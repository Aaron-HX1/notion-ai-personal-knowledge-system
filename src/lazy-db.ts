import type {DB} from './db.js';
export function lazyDatabase(open:()=>Promise<DB>){
 let value:DB|undefined,pending:Promise<DB>|undefined;
 const state:{phase:'idle'|'initializing'|'ready'|'error';error?:string}={phase:'idle'};
 const ready=()=>pending??=(async()=>{state.phase='initializing';try{value=await open();state.phase='ready';return value;}catch(e){state.phase='error';throw e;}})();
 const db:DB={query:async(sql,params)=>{let connection:DB;try{connection=await ready();}catch(e){throw Object.assign(new Error('本地数据库尚未就绪或初始化失败，请查看运行状态'),{statusCode:503,cause:e});}return connection.query(sql,params);},end:async()=>{if(pending)await pending.catch(()=>{});await value?.end();}};
 return {db,ready,state};
}
