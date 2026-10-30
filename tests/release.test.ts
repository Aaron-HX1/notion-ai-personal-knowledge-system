import {it,expect} from 'vitest';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {randomBytes} from 'node:crypto';
// @ts-ignore native ESM release script
import {releaseFiles,buildRelease} from '../scripts/package-release.mjs';
// @ts-ignore frontend module
import {renderMarkdown} from '../public/markdown.js';
it('exports only clean sources with executable launchers and integrity metadata',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kb-release-'));
 try{
  const files=await releaseFiles();for(const file of files){await mkdir(dirname(join(root,file)),{recursive:true});await copyFile(file,join(root,file));}
  const secret=randomBytes(32).toString('hex');await writeFile(join(root,'.env'),'API_TOKEN='+secret);for(const dir of ['data','work','dist','node_modules','outputs'])await mkdir(join(root,dir),{recursive:true});await writeFile(join(root,'data/config.json'),secret);await writeFile(join(root,'docs/instance.md'),secret);
  const result=await buildRelease(root,'TEST');const manifest=JSON.parse(await readFile(join(result.folder,'RELEASE_MANIFEST.json'),'utf8'));const paths=manifest.files.map((x:any)=>x.path);
  expect(paths).toContain('.env.example');expect(paths).toContain('DEPLOY_GUIDE.md');expect(paths).toContain('start.command');expect(paths).not.toContain('.env');expect(paths).not.toContain('docs/instance.md');expect(paths.some((p:string)=>/^(data|work|dist|node_modules)\//.test(p))).toBe(false);
  expect((await stat(join(result.folder,'start.command'))).mode&0o111).toBeGreaterThan(0);expect(await readFile(join(result.folder,'SHA256SUMS.txt'),'utf8')).toContain('RELEASE_MANIFEST.json');expect((await readFile(result.archive+'.sha256','utf8')).startsWith(result.sha256)).toBe(true);
 }finally{await rm(root,{recursive:true,force:true});}
});
it('renders only allowed local deployment illustrations as images',()=>{
 expect(renderMarkdown('![部署示意](/guide-assets/setup-flow.svg)')).toContain('<img src="/guide-assets/setup-flow.svg"');expect(renderMarkdown('![x](https://evil.example/track.svg)')).not.toContain('<img');expect(renderMarkdown('![x](/guide-assets/../../secret.svg)')).not.toContain('<img');
});
