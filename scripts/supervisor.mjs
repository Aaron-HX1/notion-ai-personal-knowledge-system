import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
await writeFile('work/supervisor.pid',String(process.pid),{mode:0o600});
let child,stopping=false;
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;child?.kill(signal);});
let crashes=0;
while(!stopping){
 const started=Date.now();child=spawn(process.execPath,['dist/server.js'],{stdio:'inherit'});
 const code=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('exit',code=>resolve(code??1));});
 if(stopping||code===0)break;
 crashes=Date.now()-started>60000?0:crashes+1;
 if(crashes>=5){console.error('后台服务连续失败，请检查配置与 work/server.log');process.exitCode=1;break;}
 await new Promise(r=>setTimeout(r,1000));
}
