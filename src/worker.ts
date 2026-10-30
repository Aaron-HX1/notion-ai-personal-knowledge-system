import {loadConfig} from './config.js';import {database} from './db.js';import {runWorker} from './worker-loop.js';const c=loadConfig(),db=await database(c);await runWorker(c,db);
