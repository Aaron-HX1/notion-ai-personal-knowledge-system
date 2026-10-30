import {it,expect} from 'vitest';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {prepareStorageDirectory,saveLocalSettings,validateStorageDirectory} from '../src/local-settings.js';

it('copies stored files when switching the local directory',async()=>{
  await mkdir('work',{recursive:true});const root=await mkdtemp(resolve('work/settings-test-'));
  try{const old=join(root,'old'),next=join(root,'next');await mkdir(join(old,'uploads'),{recursive:true});await writeFile(join(old,'uploads','a.txt'),'original');
    expect(await prepareStorageDirectory(old,next)).toBe(next);
    expect(await readFile(join(next,'uploads','a.txt'),'utf8')).toBe('original');
    expect(()=>validateStorageDirectory('relative/path')).toThrow();
  }finally{await rm(root,{recursive:true,force:true});}
});

it('saves only selected settings without exposing or changing unrelated secrets',async()=>{
  await mkdir('work',{recursive:true});const root=await mkdtemp(resolve('work/settings-env-'));const path=join(root,'.env');
  try{await writeFile(path,'NOTION_TOKEN=keep-private\nMOCK_AI=true\nOPENAI_API_KEY=old\n');const c={MOCK_AI:true,OPENAI_API_KEY:'old'} as any;
    await saveLocalSettings(c,{MOCK_AI:false,OPENAI_API_KEY:'new#key'},path);
    const contents=await readFile(path,'utf8');expect(contents).toContain('NOTION_TOKEN=keep-private');expect(contents).toContain('OPENAI_API_KEY="new#key"');expect(c.MOCK_AI).toBe(false);expect(c.OPENAI_API_KEY).toBe('new#key');
  }finally{await rm(root,{recursive:true,force:true});}
});
