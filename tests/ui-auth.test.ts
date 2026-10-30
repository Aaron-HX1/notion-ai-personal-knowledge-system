import {it,expect} from 'vitest';
import {hasUiSession,sameLocalOrigin,uiSessionFor} from '../src/ui-auth.js';
it('keeps the local UI session stable across restarts and rotates it with API_TOKEN',()=>{
  const beforeRestart=uiSessionFor('local-token-12345678901234567890');
  const afterRestart=uiSessionFor('local-token-12345678901234567890');
  expect(afterRestart).toBe(beforeRestart);
  expect(uiSessionFor('rotated-token-12345678901234567890')).not.toBe(beforeRestart);
});
it('accepts only the current UI cookie',()=>{
  expect(hasUiSession('other=x; kb_session=abc123','abc123')).toBe(true);
  expect(hasUiSession('kb_session=wrong','abc123')).toBe(false);
  expect(hasUiSession(undefined,'abc123')).toBe(false);
});
it('restricts local UI writes to the same origin',()=>{
  expect(sameLocalOrigin('http://127.0.0.1:3000',3000)).toBe(true);
  expect(sameLocalOrigin('http://localhost:3000',3000)).toBe(true);
  expect(sameLocalOrigin('https://example.com',3000)).toBe(false);
});
