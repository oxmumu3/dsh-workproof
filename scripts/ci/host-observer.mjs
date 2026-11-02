import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export const name='workproof-isolated-compatibility-proof';
export const inject=['loader','pluginManager','tools','commands','sessions','webServer'];
export function apply(ctx,config){
 const receive=async message=>{
  if(message?.action!=='proof')return;
  const result={action:'proof',hostVersion:config.version,syntheticHome:true,realAccounts:false};
  try{
   await ctx.loader.await();const manager=ctx.get('pluginManager');const bundles=await manager.listBundles();const plugins=await manager.listPlugins();result.bundles=[];
   for(const packageName of ['@oxmumu3/dsh-delivery-receipts','@oxmumu3/dsh-evidence-ledger']){
    const b=bundles.find(x=>x.name===packageName);assert.equal(b?.version,config.packageVersions[packageName]);assert.equal(b.enabled,true);assert.equal(b.error,undefined);
    const p=plugins.find(x=>x.moduleName===packageName);assert.equal(p?.fiberPhase,'active');result.bundles.push({name:b.name,version:b.version,enabled:b.enabled,phase:p.fiberPhase});
   }
   const session=ctx.sessions.create('workproof-official-host-owner',{meta:{cwd:config.workspace}});
   const agent=Object.freeze({id:session.id,session,ctx});let call=0;
   const tool=async(name,args)=>{const r=await ctx.tools.execute({callId:'workproof-cli-'+(++call),name,arguments:args,agent,signal:new AbortController().signal});assert.equal(r.isError,false,JSON.stringify(r.error??r.content));return r.value;};
   const command=async(name,args)=>{const r=await ctx.commands.execute(agent,`/${name} ${JSON.stringify(args)}`,[],new AbortController().signal);assert.equal(r?.result.kind,'success',JSON.stringify(r?.result));return JSON.parse(r.result.text);};
   const bytes=await readFile(join(config.workspace,'synthetic-artifact.md'));
   let receipt=await tool('delivery_receipt',{action:'record',title:'Synthetic official Host check',paths:['synthetic-artifact.md'],checks:['Synthetic recorded claim']});
   const id=receipt.view.id;assert.equal(receipt.view.version,1);assert.equal(receipt.view.artifacts[0].current.sha256,createHash('sha256').update(bytes).digest('hex'));
   receipt=await command('delivery_receipts',{action:'decide',id,expectedVersion:1,decision:'accepted',note:'Synthetic user-side decision'});assert.equal(receipt.view.state,'accepted');
   await writeFile(join(config.workspace,'synthetic-artifact.md'),'Synthetic changed version\n');receipt=await tool('delivery_receipt',{action:'inspect',id});assert.equal(receipt.view.state,'stale');result.receipt={toolHash:true,userCommandAcceptance:true,changedFileStale:true};
   let ledger=await tool('evidence_ledger',{action:'save_source',expectedVersion:0,title:'Synthetic source',sourceKind:'public_url',reference:'https://example.invalid/never-fetched',locator:'Synthetic section'});
   const sourceId=ledger.ledger.sources[0].id;ledger=await tool('evidence_ledger',{action:'save_claim',expectedVersion:1,text:'Synthetic assertion',claimKind:'fact_assertion',links:[{sourceId,relation:'supports'}]});
   ledger=await command('evidence_ledger',{action:'review',expectedVersion:2,status:'reviewed',note:'Synthetic review'});assert.equal(ledger.ledger.review.version,2);
   ledger=await tool('evidence_ledger',{action:'save_question',expectedVersion:2,question:'Synthetic open question?'});assert.equal(ledger.ledger.review,null);result.ledger={sourceMetadataOnly:true,toolSave:true,userCommandReview:true,editInvalidatesReview:true};
   const network=globalThis.__workproofNetworkProof;assert.ok(network);assert.equal(network.externalAttempts,0);result.network={...network};result.realExternalRequests=0;result.passed=true;
  }catch(error){result.passed=false;result.error=String(error.stack??error);}
  process.send?.(result);
 };
 ctx.effect(()=>{process.on('message',receive);return()=>process.off('message',receive);});
}
