import {join} from 'node:path';
import {assertTestedVersion} from '../check-official-compatibility.mjs';
export const SDK_SERVICES=['dsh-system-prompt','dsh-tools','dsh-commands','dsh-storage','dsh-storage-json','dsh-storage-domain','dsh-session'];
export function matrixFromOfficialMetadata(manifest,metadata){
 if(metadata?.name!=='@deepseek-ai/dsh')throw Error('Official npm package identity mismatch');
 assertTestedVersion(manifest,metadata.version);return [...manifest.testedHostVersions];
}
export function sdkInstallPlan(manifest,version){
 assertTestedVersion(manifest,version);
 const officialHost=!['0.2.0-rc.2','0.2.1-rc.3'].includes(version);
 const cordis=version==='0.2.0-rc.2'?'4.0.4':version==='0.2.2-rc.1'?'4.1.0':'4.0.5';
 const node=version==='0.2.2-rc.1'?'24.22.1':'22.22.0';
 const dependencies=Object.fromEntries(SDK_SERVICES.map(name=>['@deepseek-ai/'+name,version]));
 Object.assign(dependencies,{'@deepseek-ai/cordis':cordis,zod:'4.6.6'});
 if(version==='0.2.2-rc.1')dependencies['@deepseek-ai/dsh-tool-executor-native']=version;
 if(officialHost)Object.assign(dependencies,{'@deepseek-ai/dsh':version,pnpm:'11.28.5'});
 return {sdkVersion:version,cordis,node,officialHost,dependencies};
}
export function isolatedEnv(root,path){
 return {PATH:path,HOME:join(root,'home'),XDG_CONFIG_HOME:join(root,'home','.config'),XDG_DATA_HOME:join(root,'home','.local','share'),TMPDIR:root,LANG:'en_US.UTF-8',TZ:'UTC',DSH_HOME:join(root,'home','dsh'),DSH_AGENTS_HOME:join(root,'agents'),DSH_TELEMETRY_DISABLED:'1',NPM_CONFIG_USERCONFIG:join(root,'npmrc'),NPM_CONFIG_CACHE:join(root,'npm-cache'),NPM_CONFIG_REGISTRY:'https://registry.npmjs.org/',NPM_CONFIG_IGNORE_SCRIPTS:'true',COREPACK_ENABLE_AUTO_PIN:'0'};
}
export function validateArtifactManifest(value,expected){
 const checks={name:expected.name,version:expected.version,repository:'oxmumu3/dsh-workproof',source_directory:expected.sourceDirectory,source_commit:expected.sourceCommit,run_id:expected.runId,run_attempt:expected.runAttempt};
 if(Object.entries(checks).some(([key,want])=>typeof want!=='string'||!want||value[key]!==want)
  ||!/^([a-f0-9]{64})$/.test(value.sha256)||!/^[-A-Za-z0-9_.]+\.tgz$/.test(value.filename))throw Error('Release artifact identity/hash binding mismatch');
 return value;
}

export function validateTap(text,minimum=86){
 const counts=Object.fromEntries([...text.matchAll(/^# (tests|pass|fail|skipped|cancelled) (\d+)$/gm)].map(match=>[match[1],Number(match[2])]));
 if(!(counts.tests>=minimum&&counts.pass===counts.tests&&counts.fail===0&&counts.skipped===0&&counts.cancelled===0))throw Error('TAP suite failed, incomplete, empty, skipped or cancelled');
 return counts;
}

export function assertNodeRuntime(plan,version){
 if(version!==plan.node)throw Error(`Use exact Node ${plan.node} for SDK ${plan.sdkVersion}; got ${version}`);
}

export function validateLifecycleProof(steps){
 const expected=['installed','active','disabled','restartedDisabled','reenabled','restartedEnabled','uninstalled','restartedAbsent'];
 if(!Array.isArray(steps)||steps.length!==expected.length||steps.some((value,index)=>value.step!==expected[index]||value.passed!==true))throw Error('Incomplete official Host lifecycle proof');
 return steps;
}
