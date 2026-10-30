import {describe,it,expect} from 'vitest';import {privateIp,safeUrl,authorized} from '../src/security.js';import {analysisSchema} from '../src/ai.js';
describe('URL security',()=>{it('blocks internal address ranges',()=>{for(const ip of ['127.0.0.1','169.254.169.254','10.1.2.3','192.168.1.1','172.20.0.1','::1','fc00::1'])expect(privateIp(ip)).toBe(true);});it('rejects metadata and credentials',async()=>{await expect(safeUrl('http://169.254.169.254/latest')).rejects.toThrow();await expect(safeUrl('http://198.18.0.86/',true)).rejects.toThrow();await expect(safeUrl('http://u:p@example.com')).rejects.toThrow();await expect(safeUrl('file:///etc/passwd')).rejects.toThrow();});});
describe('AI output validation',()=>it('rejects malformed output',()=>{expect(analysisSchema.safeParse({title:'x'}).success).toBe(false);}));

it('never authenticates an explicitly deleted console token',()=>{expect(authorized('Bearer ','')).toBe(false);});
