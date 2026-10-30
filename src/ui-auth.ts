import {createHmac,timingSafeEqual} from 'node:crypto';

// Keep the local browser session valid across normal service restarts. Rotating
// API_TOKEN automatically invalidates previously issued UI cookies.
export function uiSessionFor(apiToken:string):string {
  return createHmac('sha256',apiToken).update('knowledgebot-local-ui-session-v1').digest('hex');
}

export function hasUiSession(cookieHeader:string|undefined, expected:string):boolean {
  const token = cookieHeader?.split(';').map(x=>x.trim()).find(x=>x.startsWith('kb_session='))?.slice('kb_session='.length);
  if (!token) return false;
  const actual=Buffer.from(token), wanted=Buffer.from(expected);
  return actual.length===wanted.length && timingSafeEqual(actual,wanted);
}

export function sameLocalOrigin(origin:string|undefined, port:number):boolean {
  return origin===`http://127.0.0.1:${port}`||origin===`http://localhost:${port}`;
}
