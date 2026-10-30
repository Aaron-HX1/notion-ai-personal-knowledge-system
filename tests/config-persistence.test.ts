import {it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,renameSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {loadPersistentEnvironment,persistConfiguration,maskedSecrets} from '../src/config-store.js';
import {saveLocalSettings} from '../src/local-settings.js';
const fixture=()=>mkdtempSync(join(tmpdir(),'kb-config-'));
it('preserves unrelated lines, escaped keys, blank form values and private file permissions',async()=>{
 const root=fixture(),file=join(root,'.env');const old=process.env.DEEPSEEK_API_KEY;
 try{writeFileSync(file,'# keep comment\n export DEEPSEEK_API_KEY = old\nPORT=3000\n');const c={DEEPSEEK_API_KEY:'old'} as any;
 await saveLocalSettings(c,{DEEPSEEK_API_KEY:'test-$&#"\\value'},file);
 await saveLocalSettings(c,{DEEPSEEK_API_KEY:''},file);
 expect(loadPersistentEnvironment(file).DEEPSEEK_API_KEY).toBe('test-$&#"\\value');
 expect(readFileSync(file,'utf8')).toContain('# keep comment\n');expect(readFileSync(file,'utf8')).toContain('PORT=3000');
 expect(c.DEEPSEEK_API_KEY).toBe('test-$&#"\\value');expect(statSync(file).mode&0o777).toBe(0o600);expect(statSync(join(root,'data/config.json')).mode&0o777).toBe(0o600);
 expect(JSON.stringify(maskedSecrets(c))).not.toContain('test-$');
 }finally{if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old;rmSync(root,{recursive:true,force:true});}
});
it('restores missing env from backup and never resurrects an explicitly deleted key',()=>{
 const root=fixture(),file=join(root,'.env');try{
 persistConfiguration({NOTION_TOKEN:'private-existing'},{DEEPSEEK_API_KEY:'saved-key'},file);
 renameSync(file,file+'.saved');expect(loadPersistentEnvironment(file).DEEPSEEK_API_KEY).toBe('saved-key');
 persistConfiguration({}, {},file,['DEEPSEEK_API_KEY']);renameSync(file,file+'.deleted');
 expect(loadPersistentEnvironment(file).DEEPSEEK_API_KEY).toBe('');expect(readFileSync(join(root,'data/config.json'),'utf8')).not.toContain('saved-key');
 }finally{rmSync(root,{recursive:true,force:true});}
});
it('heals a corrupt cold backup when the primary config still exists',()=>{
 const root=fixture(),file=join(root,'.env');try{persistConfiguration({},{DEEPSEEK_API_KEY:'saved'},file);writeFileSync(join(root,'data/config.json'),'broken');expect(loadPersistentEnvironment(file).DEEPSEEK_API_KEY).toBe('saved');persistConfiguration(loadPersistentEnvironment(file),{},file);expect(JSON.parse(readFileSync(join(root,'data/config.json'),'utf8')).values.DEEPSEEK_API_KEY).toBe('saved');}finally{rmSync(root,{recursive:true,force:true});}
});
it('reloads persisted credentials in fresh backend processes including env-loss recovery',()=>{
 const root=fixture(),file=join(root,'.env');try{
 const id='00000000-0000-4000-8000-000000000001';persistConfiguration({API_TOKEN:'test-token-12345678901234567890',NOTION_TOKEN:'test-notion-token',NOTION_KNOWLEDGE_DATA_SOURCE_ID:id,NOTION_COLLECTIONS_DATA_SOURCE_ID:id,NOTION_JOBS_DATA_SOURCE_ID:id,MOCK_AI:true},{DEEPSEEK_API_KEY:'fixture-saved-key'},file);
 const script=`import {loadConfig} from ${JSON.stringify(pathToFileURL(resolve('src/config.ts')).href)};const c=loadConfig();console.log(JSON.stringify({key:c.DEEPSEEK_API_KEY,notion:c.NOTION_TOKEN}));`;
 const launch=()=>JSON.parse(execFileSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,'--input-type=module','-e',script],{cwd:root,env:{PATH:process.env.PATH},encoding:'utf8'}));
 expect(launch()).toEqual({key:'fixture-saved-key',notion:'test-notion-token'});renameSync(file,file+'.lost');expect(launch()).toEqual({key:'fixture-saved-key',notion:'test-notion-token'});
 }finally{rmSync(root,{recursive:true,force:true});}
});
it('keeps category lists usable after restoring the cold backup',()=>{
 const root=fixture(),file=join(root,'.env');try{persistConfiguration({CATEGORIES:['分类一','分类二']},{},file);renameSync(file,file+'.lost');expect(loadPersistentEnvironment(file).CATEGORIES).toBe('分类一|分类二');}finally{rmSync(root,{recursive:true,force:true});}
});
