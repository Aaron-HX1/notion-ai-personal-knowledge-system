export async function mapPool<T,R>(items:T[],limit:number,fn:(item:T,index:number)=>Promise<R>):Promise<R[]>{
 if(!Number.isInteger(limit)||limit<1)throw new Error('并发度必须大于零');
 const result=new Array<R>(items.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(items.length,limit)},async()=>{while(cursor<items.length){const index=cursor++;result[index]=await fn(items[index],index);}}));
 return result;
}
