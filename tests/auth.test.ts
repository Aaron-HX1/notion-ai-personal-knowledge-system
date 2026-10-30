import {it,expect} from 'vitest';import {authorized,exportDownloadAvailable} from '../src/security.js';
it('requires correct bearer token',()=>{expect(authorized('Bearer valid','valid')).toBe(true);expect(authorized('Bearer wrong','valid')).toBe(false);expect(authorized(undefined,'valid')).toBe(false);});
it('rejects expired export jobs',()=>{const now=new Date('2026-10-29T12:00:00Z');expect(exportDownloadAvailable(new Date('2026-10-28T11:00:00Z'),now)).toBe(false);expect(exportDownloadAvailable(new Date('2026-10-29T11:00:00Z'),now)).toBe(true);});
