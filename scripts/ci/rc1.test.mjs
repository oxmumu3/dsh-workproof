import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as contracts from './contracts.mjs';
import * as compatibility from '../check-official-compatibility.mjs';
const manifest=JSON.parse(await readFile(new URL('../../compatibility-manifest.json',import.meta.url)));
const exact='0.2.2-rc.1';
test('reviewed rc1 extends the exact supported set without replacing prior SDKs',()=>{
 assert.deepEqual(manifest.testedHostVersions,['0.2.0-rc.2','0.2.1-rc.3','0.2.1-rc.4','0.2.1-rc.5',exact]);
 const plan=contracts.sdkInstallPlan(manifest,exact);
 assert.equal(plan.cordis,'4.1.0');assert.equal(plan.node,'24.22.1');assert.equal(plan.officialHost,true);
 for(const name of contracts.SDK_SERVICES)assert.equal(plan.dependencies['@deepseek-ai/'+name],exact);
});
test('Node requirement follows the exact SDK rather than a global major exemption',()=>{
 assert.equal(typeof contracts.assertNodeRuntime,'function');
 assert.doesNotThrow(()=>contracts.assertNodeRuntime(contracts.sdkInstallPlan(manifest,exact),'24.22.1'));
 for(const bad of ['22.22.0','24.8.0','25.0.0'])assert.throws(()=>contracts.assertNodeRuntime(contracts.sdkInstallPlan(manifest,exact),bad),/Node/);
 for(const version of manifest.testedHostVersions.filter(x=>x!==exact)){
  assert.equal(contracts.sdkInstallPlan(manifest,version).node,'22.22.0');
  assert.doesNotThrow(()=>contracts.assertNodeRuntime(contracts.sdkInstallPlan(manifest,version),'22.22.0'));
 }
});
test('independent Desktop advance must match exact SDK next and reviewed evidence',()=>{
 assert.equal(typeof compatibility.assertOfficialChannels,'function');
 const channels={latest:{name:'@deepseek-ai/dsh',version:'0.2.1-rc.5'},next:{name:'@deepseek-ai/dsh',version:exact},desktop:{version:exact}};
 assert.equal(compatibility.assertOfficialChannels(manifest,channels).desktopVersion,exact);
 for(const changed of [
  {...channels,desktop:{version:'0.2.2-rc.2'}},
  {...channels,next:{name:'@deepseek-ai/dsh',version:'0.2.1-rc.5'}},
  {...channels,next:{name:'wrong',version:exact}},
  {...channels,desktop:{version:'0.2.2-alpha.3'},next:{name:'@deepseek-ai/dsh',version:'0.2.2-alpha.3'}},
 ])assert.throws(()=>compatibility.assertOfficialChannels(manifest,changed),/untested|match|identity|alpha/i);
});
test('Host lifecycle proof cannot omit a restart, disablement or removal step',()=>{
 assert.equal(typeof contracts.validateLifecycleProof,'function');
 const names=['installed','active','disabled','restartedDisabled','reenabled','restartedEnabled','uninstalled','restartedAbsent'];
 const steps=names.map(step=>({step,passed:true}));
 assert.doesNotThrow(()=>contracts.validateLifecycleProof(steps));
 for(let i=0;i<steps.length;i++){
  assert.throws(()=>contracts.validateLifecycleProof(steps.filter((_,n)=>n!==i)),/lifecycle/i);
  assert.throws(()=>contracts.validateLifecycleProof(steps.map((x,n)=>n===i?{...x,passed:false}:x)),/lifecycle/i);
 }
});
test('live channel guard independently reads latest, next and the official Desktop feed',async()=>{
 const urls=[];
 const result=await compatibility.checkOfficialCompatibility(['--latest'],{fetchImpl:async url=>{
  urls.push(url);return {ok:true,json:async()=>({name:'@deepseek-ai/dsh',version:url.endsWith('/next')?exact:'0.2.1-rc.5'}),text:async()=>`version: ${exact}\nfiles: []\n`};
 }});
 assert.equal(urls.length,3);assert.ok(urls.includes(compatibility.OFFICIAL_DESKTOP_FEED));
 assert.equal(result.desktopVersion,exact);assert.equal(result.sdkNext,exact);
 await assert.rejects(()=>compatibility.checkOfficialCompatibility(['--latest'],{fetchImpl:async()=>({ok:false,status:503})}),/channel lookup/);
});
test('ambiguous or missing Desktop version is unavailable evidence',()=>{
 for(const text of ['',`version: ${exact}\nversion: ${exact}\n`,'version: latest\n','x'.repeat(65537)])assert.throws(()=>compatibility.desktopVersionFromFeed(text),/Desktop/);
});
test('an unchanged Desktop does not excuse malformed SDK next metadata',()=>{
 assert.throws(()=>compatibility.assertOfficialChannels(manifest,{latest:{name:'@deepseek-ai/dsh',version:'0.2.1-rc.5'},next:{name:'@deepseek-ai/dsh',version:'latest'},desktop:{version:'0.2.1-rc.5'}}),/invalid/i);
});
for(const [label,feed] of [
 ['unclosed version quote','version: "0.2.2-rc.1\n'],
 ['mismatched version quotes',`version: '0.2.2-rc.1"\n`],
 ['quoted duplicate version key','version: 0.2.2-rc.1\n"version": 0.2.2-rc.2\n'],
])test(`Desktop feed rejects ${label}`,()=>{
 assert.throws(()=>compatibility.desktopVersionFromFeed(feed),/Desktop/);
});
test('Desktop projection accepts one strict plain or quoted version scalar and key',()=>{
 for(const feed of [
  'version: 0.2.2-rc.1\nfiles:\n  - url: public.zip\n',
  'version: "0.2.2-rc.1"\n',
  "version: '0.2.2-rc.1'\n",
  '\ufeff"version": "0.2.2-rc.1" # current\r\n',
  "'version': '0.2.2-rc.1'\n",
 ])assert.deepEqual(compatibility.desktopVersionFromFeed(feed),{version:exact});
});
