import type {Config} from './config.js';
export function safeError(error:unknown,c:Config){let message=String(error);for(const value of [c.API_TOKEN,c.NOTION_TOKEN,c.OPENAI_API_KEY,c.DEEPSEEK_API_KEY,c.AI_API_KEY,c.OCR_API_KEY,c.S3_ACCESS_KEY_ID,c.S3_SECRET_ACCESS_KEY,c.DATABASE_URL])if(value&&value.length>4)message=message.replaceAll(value,'[REDACTED]');return message.slice(0,500);}
