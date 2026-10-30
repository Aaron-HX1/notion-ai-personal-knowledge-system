import {it,expect,vi,afterEach} from 'vitest';
vi.mock('node:dns/promises',()=>({lookup:vi.fn(async()=>[{address:'140.82.112.6',family:4}])}));
vi.mock('undici',()=>({Agent:class {close=vi.fn(async()=>{});},fetch:vi.fn()}));
import {fetch} from 'undici';
import {publicFetch} from '../src/security.js';
afterEach(()=>{vi.resetAllMocks();vi.useRealTimers();});
it('retries transient GitHub network failure and returns content',async()=>{
 vi.useFakeTimers();const f=vi.mocked(fetch);
 f.mockRejectedValueOnce(new TypeError('fetch failed',{cause:Object.assign(new Error('connect'),{code:'ECONNRESET'})}));
 f.mockResolvedValueOnce(new Response('README',{headers:{'content-type':'text/plain'}}) as any);
 const result=publicFetch('https://api.github.com/repos/owner/repo');
 await vi.runAllTimersAsync();expect((await result).bytes.toString()).toBe('README');expect(f).toHaveBeenCalledTimes(2);
});
it('reports the nested network cause after bounded retries',async()=>{
 vi.useFakeTimers();vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed',{cause:Object.assign(new Error('connect'),{code:'UND_ERR_CONNECT_TIMEOUT'})}));
 const check=expect(publicFetch('https://api.github.com/repos/owner/repo')).rejects.toThrow('UND_ERR_CONNECT_TIMEOUT');
 await vi.runAllTimersAsync();await check;expect(fetch).toHaveBeenCalledTimes(3);
});
it('does not retry HTTP permission errors',async()=>{
 vi.mocked(fetch).mockResolvedValue(new Response('',{status:403}) as any);
 await expect(publicFetch('https://api.github.com/repos/owner/repo')).rejects.toThrow('HTTP 403');expect(fetch).toHaveBeenCalledTimes(1);
});
