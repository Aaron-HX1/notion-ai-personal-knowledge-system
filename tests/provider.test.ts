import {it,expect,vi} from 'vitest';
import {CompatibleAdapter,makeProvider} from '../src/llm-provider.js';
import {AI,sampleForAI} from '../src/ai.js';
import {effectiveProvider,providerKey,reasoningModel,textModel} from '../src/config.js';
vi.mock('../src/local-ocr.js',()=>({localOcr:vi.fn(async()=>{throw new Error('Vision unavailable in fixture');})}));

const config:any={AI_PROVIDER:'deepseek',MOCK_AI:false,DEEPSEEK_API_KEY:'deepseek-test-key',AI_BASE_URL:'https://api.deepseek.com',AI_MODEL:'deepseek-flash',AI_REASONING_MODEL:'deepseek-v4-pro',CATEGORIES:['其他'],MAX_MONTHLY_AI_CALLS:100};
it('uses DeepSeek JSON mode with the required json instruction and field example',async()=>{
 const create=vi.fn(async(input:any)=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({title:'t',type:'web',category:'其他',tags:[],summary:'s',key_points:[],use_cases:[],technologies:[],source_name:'x',confidence:.8,evidence:[],suggested_collection:null})}}]}));
 const adapter=makeProvider(config,{chat:{completions:{create}}} as any) as CompatibleAdapter;
 const result=await adapter.classify({body:'sample'},{});
 expect(JSON.parse(result).title).toBe('t');
 expect(create.mock.calls[0][0].response_format).toEqual({type:'json_object'});
 expect(create.mock.calls[0][0].messages[0].content.toLowerCase()).toContain('json');
 expect(create.mock.calls[0][0].messages[0].content).toContain('key_points');
 expect(adapter.name).toBe('deepseek');
 expect(create.mock.calls[0][0]).toMatchObject({thinking:{type:'disabled'},max_tokens:3000});
});
it('chooses supported DeepSeek defaults and provider credentials',()=>{
 expect(textModel(config)).toBe('deepseek-flash');expect(reasoningModel(config)).toBe('deepseek-v4-pro');
 expect(providerKey(config)).toBe('deepseek-test-key');expect(effectiveProvider(config)).toBe('deepseek');
});
it('allows a keyless local OpenAI-compatible endpoint with a path such as Ollama /v1',()=>{
 const local={...config,AI_PROVIDER:'custom',AI_API_KEY:'',AI_BASE_URL:'http://localhost:11434/v1',AI_MODEL:'llama3.2'};
 expect(makeProvider(local,{chat:{completions:{create:vi.fn()}}} as any).name).toBe('custom');
});
it('uses the local OCR path for DeepSeek auto mode without calling a visual model',async()=>{
 const ai=new AI({...config,OCR_ENGINE:'auto'} as any,{query:async()=>({rows:[{ai_calls:1}]})} as any);
 await expect(ai.ocr(Buffer.from('image bytes'),'image/png')).rejects.toThrow(/本地 OCR 不可用.*视觉 API Key/);
});
it('deduplicates concurrent analysis and reuses the 30-day analysis cache',async()=>{
 const expected={title:'T',type:'web',category:'其他',tags:[],summary:'S',key_points:[],use_cases:[],technologies:[],source_name:'X',confidence:.8,evidence:[],suggested_collection:null};
 let cached:any,modelCalls=0,budgetCalls=0,cacheReads=0;
 const db={query:async(sql:string,params:any[]=[])=>{
  if(sql.startsWith('SELECT analysis')){cacheReads++;return {rows:cached?[{analysis:cached}]:[]};}
  if(sql.startsWith('INSERT INTO usage_monthly')){budgetCalls++;return {rows:[{ai_calls:1}]};}
  if(sql.startsWith('INSERT INTO analysis_cache')){cached=JSON.parse(params[3]);return {rows:[]};}
  return {rows:[]};
 }} as any;
 const c={...config};const ai=new AI(c,db);
 const sig=JSON.stringify([effectiveProvider(c),providerKey(c),c.AI_BASE_URL,textModel(c),c.AI_REASONING_MODEL]);
 (ai as any).adapter={name:'deepseek',classify:async()=>{modelCalls++;await Promise.resolve();return JSON.stringify(expected);},complete:async()=>'',vision:async()=>'',test:async()=>''};
 (ai as any).signature=sig;
 const input={title:'T',body:'same body',type:'web',source_name:'X'};
 const [a,b]=await Promise.all([ai.classify(input),ai.classify(input)]);
 const again=await ai.classify(input);
 expect(a).toEqual(b);expect(again).toEqual(expected);expect(modelCalls).toBe(1);expect(budgetCalls).toBe(1);expect(cacheReads).toBe(2);
});
it('keeps full content but bounds model input with headings and tail context',()=>{
 const long=Array.from({length:500},(_,i)=>i%20===0?`## Section ${i}\n${'Long paragraph content. '.repeat(20)}`:'Long paragraph content. '.repeat(20)).join('\n');
 const sample=sampleForAI(long,5000);expect(sample.length).toBeLessThanOrEqual(5000);expect(sample).toContain('Section 0');expect(sample).toContain('Section 480');
});

