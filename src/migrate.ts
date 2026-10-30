import {loadConfig} from './config.js';
import {database} from './db.js';
import {migrate} from './schema.js';
const db=await database(loadConfig());try{await migrate(db);console.log('Migration complete');}finally{await db.end();}
