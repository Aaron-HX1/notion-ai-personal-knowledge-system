import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
// Requests always return the current snapshot; refresh failures keep the last good value.
export class SnapshotCache<T>{
 get updatedAt(){return this.last;}
 get refreshing(){return !!this.pending;}
 private pending?:Promise<void>;private last=0;private saved='';
 constructor(public value:T,private path?:string){}
 async load(){if(!this.path)return;try{const loaded=JSON.parse(await readFile(this.path,'utf8'));if(!this.last){this.value=loaded;this.saved=JSON.stringify(loaded);}}catch{} }
 refresh(loader:()=>Promise<T>,ttl=2000){if(this.pending||Date.now()-this.last<ttl)return this.pending||Promise.resolve();
 this.pending=(async()=>{const next=await loader();this.value=next;this.last=Date.now();const serialized=JSON.stringify(next);if(this.path&&serialized!==this.saved){await mkdir(dirname(this.path),{recursive:true,mode:0o700});const temp=this.path+'.tmp';await writeFile(temp,serialized,{mode:0o600});await rename(temp,this.path);this.saved=serialized;}})().finally(()=>{this.pending=undefined;});return this.pending;
 }
}
