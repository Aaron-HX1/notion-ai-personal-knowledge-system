import {it,expect} from 'vitest';
import {mapPool} from '../src/concurrency.js';
it('bounds parallel URL preparation while preserving input order',async()=>{
 let active=0,max=0;const result=await mapPool([0,1,2,3,4,5,6],3,async n=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,4));active--;return n*2;});
 expect(max).toBeLessThanOrEqual(3);expect(result).toEqual([0,2,4,6,8,10,12]);
});

