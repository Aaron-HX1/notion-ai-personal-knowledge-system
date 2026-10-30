export const resourceSorts={smart:"(learning_status IN ('已学习','已部署')) ASC, score DESC NULLS LAST, updated_at DESC",score_desc:'score DESC NULLS LAST, updated_at DESC',score_asc:'score ASC NULLS LAST, updated_at DESC',newest:'COALESCE(imported_at,notion_edited_at,updated_at) DESC',oldest:'COALESCE(imported_at,notion_edited_at,updated_at) ASC'} as const;
export function validateUndo(result:any,id:string,lastEdited:string|undefined){
 if(!result||result.operation!=='created'||result.resource_id!==id||!result.created_edited_at)return '该任务无法确认新建资料，未执行撤回';
 if(!lastEdited||lastEdited!==result.created_edited_at)return '资料创建后已被修改，未执行撤回；请到资料库检查';
 return null;
}
