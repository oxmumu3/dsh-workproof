import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../../compatibility-manifest.json',import.meta.url)));
const load=async()=>{assert.ok(existsSync(new URL('./contracts.mjs',import.meta.url)),'CI contract helpers are missing');return import('./contracts.mjs');};
test('official discovery refuses a new version and a wrong package identity',async()=>{
 const {matrixFromOfficialMetadata}=await load();
 assert.deepEqual(matrixFromOfficialMetadata(manifest,{name:'@deepseek-ai/dsh',version:'0.2.1-rc.5'}),manifest.testedHostVersions);
 assert.throws(()=>matrixFromOfficialMetadata(manifest,{name:'@deepseek-ai/dsh',version:'0.2.1-rc.6'}),/untested/i);
 assert.throws(()=>matrixFromOfficialMetadata(manifest,{name:'another-package',version:'0.2.1-rc.5'}),/identity/i);
});
test('SDK install plans contain only exact public versions from the tested manifest',async()=>{
 const {sdkInstallPlan}=await load();
 for(const version of manifest.testedHostVersions){const p=sdkInstallPlan(manifest,version);assert.equal(p.sdkVersion,version);assert.equal(p.dependencies['@deepseek-ai/dsh-tools'],version);assert.equal(p.dependencies.zod,'4.6.6');assert.equal(p.officialHost,['0.2.1-rc.4','0.2.1-rc.5'].includes(version));}
 assert.throws(()=>sdkInstallPlan(manifest,'0.2.1-rc.6'),/untested/i);
 assert.throws(()=>sdkInstallPlan(manifest,'latest'),/invalid/i);
});
test('synthetic process environments do not inherit credentials or user config',async()=>{
 const {isolatedEnv}=await load();const e=isolatedEnv('/tmp/synthetic','/bin:/usr/bin');
 assert.equal(e.HOME,'/tmp/synthetic/home');assert.equal(e.NPM_CONFIG_USERCONFIG,'/tmp/synthetic/npmrc');assert.equal(e.NPM_CONFIG_IGNORE_SCRIPTS,'true');assert.equal(e.DSH_TELEMETRY_DISABLED,'1');
 for(const key of ['GH_TOKEN','GITHUB_TOKEN','NODE_OPTIONS','OPENAI_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','SSH_AUTH_SOCK','NPM_TOKEN'])assert.equal(e[key],undefined);
});
test('release artifact identity is bound to the same commit, run and attempt',async()=>{
 const {validateArtifactManifest}=await load();const expected={name:'@oxmumu3/dsh-delivery-receipts',version:'0.1.3-preview.2',sourceDirectory:'packages/dsh-delivery-receipts',sourceCommit:'a'.repeat(40),runId:'123',runAttempt:'1'};
 const good={name:expected.name,version:expected.version,repository:'oxmumu3/dsh-workproof',source_directory:expected.sourceDirectory,source_commit:expected.sourceCommit,run_id:expected.runId,run_attempt:expected.runAttempt,filename:'package.tgz',sha256:'b'.repeat(64)};
 assert.doesNotThrow(()=>validateArtifactManifest(good,expected));for(const field of ['source_commit','run_id','run_attempt','repository','name','sha256','filename'])assert.throws(()=>validateArtifactManifest({...good,[field]:'invalid'},expected),/artifact/i);
});
test('runtime guard rejects every instrumented non-loopback transport before I/O',async t=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('node:child_process');const {isolatedEnv}=await load();
 const root=mkdtempSync(join(tmpdir(),'workproof-network-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const source=`import assert from 'node:assert/strict';import http from 'node:http';import https from 'node:https';import net from 'node:net';import tls from 'node:tls';import dgram from 'node:dgram';await assert.rejects(async()=>fetch('https://example.invalid'),/denied external/);for(const call of [()=>http.get('http://example.invalid'),()=>https.get('https://example.invalid'),()=>net.connect({host:'example.invalid',port:443}),()=>tls.connect({host:'example.invalid',port:443}),()=>dgram.createSocket('udp4')])assert.throws(call,/denied external/);assert.equal(globalThis.__workproofNetworkProof.externalAttempts,6);`;
 const result=spawnSync(process.execPath,['--import',new URL('./network-guard.mjs',import.meta.url).href,'--input-type=module','-e',source],{env:isolatedEnv(root,process.env.PATH),encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);
});
test('TAP accounting rejects empty, incomplete, skipped or cancelled suites',async()=>{
 const {validateTap}=await load();assert.equal(typeof validateTap,'function');
 const complete='# tests 86\n# pass 86\n# fail 0\n# skipped 0\n# cancelled 0\n';assert.equal(validateTap(complete).tests,86);
 for(const text of ['',complete.replace('tests 86','tests 0'),complete.replace('pass 86','pass 85'),complete.replace('skipped 0','skipped 1'),complete.replace('cancelled 0','cancelled 1')])assert.throws(()=>validateTap(text),/TAP/);
});
