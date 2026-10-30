import {describe,it,expect} from 'vitest';
import {validateUndo,resourceSorts} from '../src/resource-operations.js';
describe('safe import undo',()=>{
 const created={operation:'created',resource_id:'page-1',created_edited_at:'2026-10-30T10:00:00.000Z'};
 it('allows only the untouched page created by the matching import',()=>{expect(validateUndo(created,'page-1',created.created_edited_at)).toBeNull();expect(validateUndo(created,'page-2',created.created_edited_at)).toBeTruthy();expect(validateUndo(created,'page-1','2026-10-30T10:01:00.000Z')).toBeTruthy();});
 it('never treats duplicate, merge, older jobs or missing timestamps as safe to delete',()=>{for(const x of [{...created,operation:'duplicate'},{...created,operation:'merged'},{resource_id:'page-1'},null,{...created,created_edited_at:null}])expect(validateUndo(x,'page-1',created.created_edited_at)).toBeTruthy();});
});
it('only the default sort places completed learning states after pending',()=>{expect(resourceSorts.smart).toContain("learning_status IN ('已学习','已部署')");for(const [key,value] of Object.entries(resourceSorts))if(key!=='smart')expect(value).not.toContain('learning_status');});
it('orders persisted resources by smart priority and explicit score order',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();try{await db.exec("CREATE TABLE resources(notion_id text,learning_status text,score integer,updated_at timestamptz,imported_at timestamptz,notion_edited_at timestamptz); INSERT INTO resources VALUES ('done','已学习',10,now(),now(),now()),('pending','待学习',6,now(),now(),now()),('deployed','已部署',9,now(),now(),now());");
 const smart=await db.query(`SELECT notion_id FROM resources ORDER BY ${resourceSorts.smart}`);expect(smart.rows.map((x:any)=>x.notion_id)).toEqual(['pending','done','deployed']);const explicit=await db.query(`SELECT notion_id FROM resources ORDER BY ${resourceSorts.score_desc}`);expect(explicit.rows.map((x:any)=>x.notion_id)).toEqual(['done','deployed','pending']);
 }finally{await db.close();}
});
