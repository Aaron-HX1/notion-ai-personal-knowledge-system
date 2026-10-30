import {readFile,readdir} from 'node:fs/promises';
import type {DB} from './db.js';
export async function migrate(db:DB){const folder=new URL('../migrations/',import.meta.url);const files=(await readdir(folder)).filter(x=>/^\d+_.*\.sql$/.test(x)).sort();for(const name of files)await db.query(await readFile(new URL(name,folder),'utf8'));}
