import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import ToolRuntime from '@deepseek-ai/dsh-tools';
const require=createRequire(import.meta.url);
const version=require('@deepseek-ai/dsh-tools/package.json').version;
const batch=version==='0.2.2-rc.1';
assert.ok(['0.2.0-rc.2','0.2.1-rc.3','0.2.1-rc.4','0.2.1-rc.5','0.2.2-rc.1'].includes(version),'Unreviewed tool runtime');
export async function mountToolRuntime(ctx){
 await ctx.plugin(ToolRuntime,batch?{}:{mode:'native'});
 if(batch)await ctx.plugin(await import('@deepseek-ai/dsh-tool-executor-native'));
}
export async function executeTool(ctx,input){
 if(!batch)return ctx.tools.execute(input);
 const {callId,name,arguments:args,agent,signal}=input;
 const outcome=await ctx.tools.execute({calls:[{type:'tool-call',id:callId,name,arguments:JSON.stringify(args)}],agent,signal});
 assert.equal(outcome.results.length,1);assert.equal(outcome.results[0].callId,callId);
 return outcome.results[0].result;
}
