import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,cp,symlink,realpath,readdir} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {join,resolve,dirname,basename,delimiter} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runInSandbox,verifySandbox,sandboxCommand} from './os-sandbox.mjs';
import {checkOfficialCompatibility} from '../check-official-compatibility.mjs';
import {SDK_SERVICES,sdkInstallPlan,isolatedEnv,validateArtifactManifest,validateTap,assertNodeRuntime,validateLifecycleProof} from './contracts.mjs';
process.umask(0o077);
const source=fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){assert.ok(['--version','--output','--runtime-root','--artifacts-dir','--artifact-run-attempt','--mode'].includes(args[i]),'Unknown option');assert.ok(args[i+1],'Missing option value');options[args[i]]=args[i+1];}

const manifest=JSON.parse(await readFile(join(source,'compatibility-manifest.json')));
const plan=sdkInstallPlan(manifest,options['--version']);assertNodeRuntime(plan,process.versions.node);
const mode=options['--mode']??'all';assert.ok(['all','services','host'].includes(mode));if(mode==='host')assert.ok(plan.officialHost,'No reviewed CLI Host contract for this SDK');
const doServices=mode!=='host',doHost=plan.officialHost&&mode!=='services';if(doHost)assert.equal(process.platform,'darwin','Official CLI Host IPC contract requires macOS sandbox');
const output=resolve(options['--output']??join(tmpdir(),'workproof-ci-'+plan.sdkVersion));await mkdir(output,{recursive:true});
const root=await mkdtemp(join(tmpdir(),'workproof-ci-')),bootstrap=join(root,'runtime'),workspace=join(root,'source');
const path=dirname(process.execPath)+delimiter+(process.env.PATH??'/usr/bin:/bin');
const env=isolatedEnv(root,path);env.NPM_CONFIG_GLOBALCONFIG=join(root,'global-npmrc');
for(const dir of [env.HOME,env.DSH_AGENTS_HOME,bootstrap])await mkdir(dir,{recursive:true});
for(const path of [env.NPM_CONFIG_USERCONFIG,env.NPM_CONFIG_GLOBALCONFIG])await writeFile(path,'registry=https://registry.npmjs.org/\nignore-scripts=true\n');
const exec=promisify(execFile);const proof={sdkVersion:plan.sdkVersion,startedAt:new Date().toISOString(),root,source,officialHostRequired:doHost,mode,reusedRuntime:Boolean(options['--runtime-root']),productionProfileUsed:false,realModels:false,realMessages:false};
const save=()=>writeFile(join(output,'proof.json'),JSON.stringify(proof,null,2)+'\n');
async function command(file,args,cwd,log,timeout=100000,extra={}){
 try{const result=await exec(file,args,{cwd,env:{...env,...extra},timeout,maxBuffer:4*1024*1024});await writeFile(join(output,log),result.stdout+result.stderr);return result.stdout;}
 catch(error){const details={log,timeoutMs:timeout,code:error.code??null,signal:error.signal??null,killed:error.killed??false};await writeFile(join(output,log),String(error.stdout??'')+String(error.stderr??'')+'\n'+JSON.stringify(details)+'\n'+String(error));const failure=Error(log+' failed: '+error.message);failure.details=details;throw failure;}
}
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
try{
 // All downloads happen here or in plugin-manager installation, without hooks,
 // credentials or a running Host. Runtime tests below block external traffic.
 const dependencies=options['--runtime-root']?{zod:'4.6.6',...(doHost?{pnpm:'11.28.5'}:{})}:{...plan.dependencies};if(!doHost){delete dependencies['@deepseek-ai/dsh'];delete dependencies.pnpm;}
 await writeFile(join(bootstrap,'package.json'),JSON.stringify({private:true,dependencies},null,2)+'\n');
 await command('npm',['install','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org/'],bootstrap,'sdk-install.log',180000);
 const runtime=await realpath(options['--runtime-root']??join(bootstrap,'node_modules'));
 const packageVersion=async name=>JSON.parse(await readFile(join(runtime,name,'package.json'))).version;
 for(const name of SDK_SERVICES)assert.equal(await packageVersion('@deepseek-ai/'+name),plan.sdkVersion,name);
 assert.equal(await packageVersion('@deepseek-ai/cordis'),plan.cordis);
 if(plan.sdkVersion==='0.2.2-rc.1')assert.equal(await packageVersion('@deepseek-ai/dsh-tool-executor-native'),plan.sdkVersion);
 if(doHost)assert.equal(await packageVersion('@deepseek-ai/dsh'),plan.sdkVersion);
 assert.equal(JSON.parse(await readFile(join(bootstrap,'node_modules/zod/package.json'))).version,'4.6.6');
 proof.runtime=runtime;proof.cordis=plan.cordis;proof.exactSdkVersionsVerified=true;
 await cp(source,workspace,{recursive:true,filter:p=>!['.git','node_modules','.local','coverage'].includes(basename(p))});
 await symlink(runtime,join(workspace,'node_modules'),'dir');
 for(const name of ['dsh-delivery-receipts','dsh-evidence-ledger']){const nm=join(workspace,'packages',name,'node_modules');await mkdir(nm);await symlink(join(bootstrap,'node_modules/zod'),join(nm,'zod'),'dir');}
 for(const script of ['host-smoke.mjs','ledger-host-smoke.mjs']){
  const path=join(workspace,'scripts',script),original=await readFile(path,'utf8');
  assert.equal(original.split("'4.0.4'").length-1,1,'Pinned Cordis assertion changed');
  assert.equal(original.split("'0.2.0-rc.2'").length-1,1,'Pinned SDK assertion changed');
  // Only expected version literals in the temporary copy change. Every original
  // tool, command, authority and persistence assertion runs unchanged.
  await writeFile(path,original.replace("'4.0.4'",JSON.stringify(plan.cordis)).replace("'0.2.0-rc.2'",JSON.stringify(plan.sdkVersion)));
 }
 const guard=pathToFileURL(join(workspace,'scripts/ci/network-guard.mjs')).href;
 const tests=[];for(const name of ['dsh-delivery-receipts','dsh-evidence-ledger'])for(const file of await readdir(join(workspace,'packages',name,'test')))if(file.endsWith('.test.js'))tests.push('packages/'+name+'/test/'+file);
 tests.push('scripts/ci/os-sandbox.test.mjs','scripts/ci/rc1.test.mjs','scripts/compatibility.test.mjs','scripts/check-release.test.mjs','scripts/host-smoke.mjs','scripts/ledger-host-smoke.mjs');
 const runtimeEnv={...env,NODE_OPTIONS:'--max-old-space-size=128'};proof.serviceHeapLimitMiB=128;proof.sandboxProbeHeapLimitMiB=128;
 proof.osNetwork=await verifySandbox({cwd:workspace,env:runtimeEnv});await writeFile(join(output,'os-network-proof.json'),JSON.stringify(proof.osNetwork,null,2)+'\n');
 if(doServices){
  const result=await runInSandbox(process.execPath,['--max-old-space-size=128','--import',guard,'--test','--test-reporter=tap',...tests],{cwd:workspace,env:runtimeEnv,timeout:240000,maxBuffer:4*1024*1024}).catch(async error=>{await writeFile(join(output,'service-suite.log'),String(error.stdout??'')+String(error.stderr??''));throw error;});
  await writeFile(join(output,'service-suite.log'),result.stdout+result.stderr);proof.tap=validateTap(result.stdout);proof.allOriginalSuitesPassed=true;
 }
 await save();
 // Fresh official lookup immediately before packing or accepting release artifacts.
 proof.prepackLatest=await checkOfficialCompatibility(['--latest']);
 const packageVersions={},archives=[];
 for(const name of ['dsh-delivery-receipts','dsh-evidence-ledger']){
  const pkg=JSON.parse(await readFile(join(workspace,'packages',name,'package.json')));packageVersions[pkg.name]=pkg.version;
  if(options['--artifacts-dir']){
   const dir=join(resolve(options['--artifacts-dir']),name),meta=JSON.parse(await readFile(join(dir,'release-manifest.json')));
   validateArtifactManifest(meta,{name:pkg.name,version:pkg.version,sourceDirectory:'packages/'+name,sourceCommit:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:options['--artifact-run-attempt']});
   const path=join(dir,meta.filename);assert.equal(await hash(path),meta.sha256);archives.push(path);
  }else{
   const rows=JSON.parse(await command('npm',['pack','--json','--ignore-scripts','--pack-destination',output],join(workspace,'packages',name),name+'-pack.log'));
   assert.equal(rows.length,1);assert.equal(rows[0].name,pkg.name);assert.equal(rows[0].version,pkg.version);assert.equal(basename(rows[0].filename),rows[0].filename);archives.push(join(output,rows[0].filename));
  }
 }
 const audit=await runInSandbox(process.execPath,['--max-old-space-size=128','--import',guard,'scripts/check-release.mjs',...archives],{cwd:workspace,env:runtimeEnv,timeout:100000,maxBuffer:1024*1024});await writeFile(join(output,'archive-check.log'),audit.stdout+audit.stderr);
 proof.packages=await Promise.all(archives.map(async path=>({path,sha256:await hash(path)})));proof.sameRunReleaseArtifacts=Boolean(options['--artifacts-dir']);
 if(doHost){
  const cli=join(runtime,'@deepseek-ai/dsh/lib/bin.js');
  const hostEnv={...env,PATH:join(bootstrap,'node_modules/.bin')+delimiter+env.PATH,NPM_CONFIG_STORE_DIR:join(root,'pnpm-store')};
  assert.equal(JSON.parse(await readFile(join(bootstrap,'node_modules/pnpm/package.json'))).version,'11.28.5');proof.pnpmVersion='11.28.5';
  // Acquisition warms an owned store before any Host starts. Actual CLI install/removal is offline and OS-sandboxed.
  const prefetch=join(root,'prefetch');await mkdir(prefetch);await writeFile(join(prefetch,'package.json'),JSON.stringify({private:true}));
  await command(join(bootstrap,'node_modules/.bin/pnpm'),['add','zod@4.6.6','--ignore-scripts','--store-dir',hostEnv.NPM_CONFIG_STORE_DIR],prefetch,'store-prefetch.log',180000,hostEnv);
  hostEnv.PNPM_CONFIG_OFFLINE='true';hostEnv.PNPM_CONFIG_IGNORE_SCRIPTS='true';
  const cliCommand=async(args,log)=>{
   // pnpm remove accepts these settings through env but rejects add-only flags.
   const flags=args[0]==='add'?['--offline','--ignore-scripts']:[];
   try{const r=await runInSandbox(process.execPath,[cli,'plugin','--profile','web',...args,...flags,'--store-dir',hostEnv.NPM_CONFIG_STORE_DIR],{cwd:workspace,env:hostEnv,timeout:90000,maxBuffer:1024*1024});await writeFile(join(output,log),r.stdout+r.stderr);}
   catch(error){await writeFile(join(output,log),String(error.stdout??'')+String(error.stderr??''));throw error;}
  };
  for(let i=0;i<archives.length;i++)await cliCommand(['add',archives[i]],'host-install-'+i+'.log');
  const profilePath=join(env.DSH_HOME,'profiles/web/package.json');
  const installed=JSON.parse(await readFile(profilePath));
  for(const name of Object.keys(packageVersions)){assert.ok(installed.dependencies[name]);assert.ok(installed.dsh.profile.bundles.includes(name));}
  proof.lifecycle=[{step:'installed',passed:true,offline:true,osSandboxed:true}];
  const project=join(root,'synthetic-project');await mkdir(project);await writeFile(join(project,'synthetic-artifact.md'),'Synthetic exact bytes\n合成测试\n');
  const patch=join(root,'proof.patch.yml');
  proof.officialHostHeapPolicy='original-node-default';proof.hostPhases=[];
  async function runHost(phase){
   await writeFile(patch,JSON.stringify([{insert:[{id:'workproof-ci-proof',name:pathToFileURL(join(workspace,'scripts/ci/host-observer.mjs')).href,config:{version:plan.sdkVersion,workspace:project,packageVersions,phase}}]}]));
   const wrapped=await sandboxCommand(process.execPath,[cli,'--profile','web','--patch',patch,'--host','127.0.0.1','--port','0','--no-open'],{...hostEnv,NODE_OPTIONS:'--import='+guard});
   const child=spawn(wrapped.command,wrapped.args,{cwd:project,env:wrapped.env,detached:true,stdio:['ignore','pipe','pipe','ipc']});
   let stdout='',stderr='',sent=false,result;
   const groupMembers=async()=>{
    if(!child.pid)return [];
    const {stdout}=await exec('/bin/ps',['-axo','pid=,pgid=,stat='],{env,timeout:3000,maxBuffer:1024*1024});
    return stdout.trim().split('\n').map(line=>line.trim().split(/\s+/)).filter(parts=>Number(parts[1])===child.pid&&!parts[2]?.startsWith('Z')).map(parts=>Number(parts[0]));
   };
   const groupSignal=async signal=>{
    if(!child.pid)return false;
    try{process.kill(-child.pid,signal);return true;}catch(error){
     if(error.code==='ESRCH')return false;
     if(error.code==='EPERM'&&(await groupMembers()).length===0)return false;
     throw error;
    }
   };
   try{result=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Own Host proof timed out: '+stderr.slice(-2000))),45000);const done=fn=>value=>{clearTimeout(timer);fn(value);};
    child.stdout.on('data',b=>{stdout=(stdout+b).slice(-20000);if(!sent&&/dsh web: http:\/\//.test(stdout)){sent=true;child.send({action:'proof'});}});child.stderr.on('data',b=>stderr=(stderr+b).slice(-20000));
    child.once('error',done(reject));child.once('exit',code=>done(reject)(Error('Own Host exited '+code+' '+stderr.slice(-2000))));child.on('message',value=>{if(value?.action==='proof')done(resolve)(value);});
   });}finally{
    await writeFile(join(output,'official-host-'+phase+'.log'),stdout+'\n'+stderr);
    await groupSignal('SIGTERM');const until=Date.now()+10000;while((await groupMembers()).length&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,20));
    if((await groupMembers()).length)await groupSignal('SIGKILL');
    assert.ok(child.exitCode!==null||child.signalCode!==null,'Own Host did not stop');
    assert.deepEqual(await groupMembers(),[],'Own Host descendants remained');
   }
   assert.equal(result.passed,true,result.error);result.hostStopped=true;proof.hostPhases.push(result);proof.lifecycle.push(...result.lifecycle);await save();return result;
  }
  await runHost('active');await runHost('restartedDisabled');await runHost('restartedEnabled');
  for(const name of Object.keys(packageVersions))await cliCommand(['remove',name],'host-uninstall-'+name.split('/').at(-1)+'.log');
  const removed=JSON.parse(await readFile(profilePath));for(const name of Object.keys(packageVersions)){assert.equal(removed.dependencies?.[name],undefined);assert.equal(removed.dsh.profile.bundles.includes(name),false);}
  proof.lifecycle.push({step:'uninstalled',passed:true,offline:true,osSandboxed:true});
  await runHost('restartedAbsent');validateLifecycleProof(proof.lifecycle);
  proof.officialHost=proof.hostPhases[0];proof.hostStopped=proof.hostPhases.every(x=>x.hostStopped);proof.lifecyclePassed=true;
 }
 proof.passed=true;proof.completedAt=new Date().toISOString();await save();console.log(JSON.stringify(proof,null,2));
}catch(error){proof.passed=false;proof.error=String(error.stack??error);proof.errorDetails=error.details??null;proof.completedAt=new Date().toISOString();await save();console.error(proof.error);process.exitCode=1;}
