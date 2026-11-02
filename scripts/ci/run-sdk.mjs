import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,cp,symlink,realpath,readdir} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {join,resolve,dirname,basename,delimiter} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {SDK_SERVICES,sdkInstallPlan,isolatedEnv,validateArtifactManifest} from './contracts.mjs';
process.umask(0o077);
const source=fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){assert.ok(['--version','--output','--runtime-root','--artifacts-dir','--artifact-run-attempt'].includes(args[i]),'Unknown option');assert.ok(args[i+1],'Missing option value');options[args[i]]=args[i+1];}
assert.equal(process.versions.node.split('.')[0],'22','Use Node 22 for compatibility checks');
const manifest=JSON.parse(await readFile(join(source,'compatibility-manifest.json')));
const plan=sdkInstallPlan(manifest,options['--version']);
const output=resolve(options['--output']??join(tmpdir(),'workproof-ci-'+plan.sdkVersion));await mkdir(output,{recursive:true});
const root=await mkdtemp(join(tmpdir(),'workproof-ci-')),bootstrap=join(root,'runtime'),workspace=join(root,'source');
const path=dirname(process.execPath)+delimiter+(process.env.PATH??'/usr/bin:/bin');
const env=isolatedEnv(root,path);env.NPM_CONFIG_GLOBALCONFIG=join(root,'global-npmrc');
for(const dir of [env.HOME,env.DSH_AGENTS_HOME,bootstrap])await mkdir(dir,{recursive:true});
for(const path of [env.NPM_CONFIG_USERCONFIG,env.NPM_CONFIG_GLOBALCONFIG])await writeFile(path,'registry=https://registry.npmjs.org/\nignore-scripts=true\n');
const exec=promisify(execFile);const proof={sdkVersion:plan.sdkVersion,startedAt:new Date().toISOString(),root,source,officialHostRequired:plan.officialHost,reusedRuntime:Boolean(options['--runtime-root']),productionProfileUsed:false,realModels:false,realMessages:false};
const save=()=>writeFile(join(output,'proof.json'),JSON.stringify(proof,null,2)+'\n');
async function command(file,args,cwd,log,timeout=100000,extra={}){
 try{const result=await exec(file,args,{cwd,env:{...env,...extra},timeout,maxBuffer:4*1024*1024});await writeFile(join(output,log),result.stdout+result.stderr);return result.stdout;}
 catch(error){const details={log,timeoutMs:timeout,code:error.code??null,signal:error.signal??null,killed:error.killed??false};await writeFile(join(output,log),String(error.stdout??'')+String(error.stderr??'')+'\n'+JSON.stringify(details)+'\n'+String(error));const failure=Error(log+' failed: '+error.message);failure.details=details;throw failure;}
}
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
try{
 // All downloads happen here or in plugin-manager installation, without hooks,
 // credentials or a running Host. Runtime tests below block external traffic.
 const dependencies=options['--runtime-root']?{zod:'4.6.6',...(plan.officialHost?{pnpm:'11.28.5'}:{})}:plan.dependencies;
 await writeFile(join(bootstrap,'package.json'),JSON.stringify({private:true,dependencies},null,2)+'\n');
 await command('npm',['install','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org/'],bootstrap,'sdk-install.log',180000);
 const runtime=await realpath(options['--runtime-root']??join(bootstrap,'node_modules'));
 const packageVersion=async name=>JSON.parse(await readFile(join(runtime,name,'package.json'))).version;
 for(const name of SDK_SERVICES)assert.equal(await packageVersion('@deepseek-ai/'+name),plan.sdkVersion,name);
 assert.equal(await packageVersion('@deepseek-ai/cordis'),plan.cordis);
 if(plan.officialHost)assert.equal(await packageVersion('@deepseek-ai/dsh'),plan.sdkVersion);
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
 tests.push('scripts/compatibility.test.mjs','scripts/check-release.test.mjs','scripts/host-smoke.mjs','scripts/ledger-host-smoke.mjs');
 await command(process.execPath,['--import',guard,'--test',...tests],workspace,'service-suite.log');proof.allOriginalSuitesPassed=true;await save();
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
 await command(process.execPath,['--import',guard,'scripts/check-release.mjs',...archives],workspace,'archive-check.log');
 proof.packages=await Promise.all(archives.map(async path=>({path,sha256:await hash(path)})));proof.sameRunReleaseArtifacts=Boolean(options['--artifacts-dir']);
 if(plan.officialHost){
  const cli=join(runtime,'@deepseek-ai/dsh/lib/bin.js');
  const hostEnv={...env,PATH:join(bootstrap,'node_modules/.bin')+delimiter+env.PATH};
  assert.equal(JSON.parse(await readFile(join(bootstrap,'node_modules/pnpm/package.json'))).version,'11.28.5');proof.pnpmVersion='11.28.5';
  for(let i=0;i<archives.length;i++)await command(process.execPath,[cli,'plugin','--profile','web','add','--ignore-scripts',archives[i]],workspace,'host-install-'+i+'.log',90000,hostEnv);
  const project=join(root,'synthetic-project');await mkdir(project);await writeFile(join(project,'synthetic-artifact.md'),'Synthetic exact bytes\n合成测试\n');
  const patch=join(root,'proof.patch.yml');await writeFile(patch,JSON.stringify([{insert:[{id:'workproof-ci-proof',name:pathToFileURL(join(workspace,'scripts/ci/host-observer.mjs')).href,config:{version:plan.sdkVersion,workspace:project,packageVersions}}]}]));
  const child=spawn(process.execPath,['--import',guard,cli,'--profile','web','--patch',patch,'--host','127.0.0.1','--port','0','--no-open'],{cwd:project,env:hostEnv,stdio:['ignore','pipe','pipe','ipc']});
  let stdout='',stderr='',sent=false;
  try{proof.officialHost=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Own Host proof timed out: '+stderr.slice(-2000))),45000);const done=fn=>value=>{clearTimeout(timer);fn(value);};
   child.stdout.on('data',b=>{stdout=(stdout+b).slice(-20000);if(!sent&&/dsh web: http:\/\//.test(stdout)){sent=true;child.send({action:'proof'});}});child.stderr.on('data',b=>stderr=(stderr+b).slice(-20000));
   child.once('error',done(reject));child.once('exit',code=>done(reject)(Error('Own Host exited '+code+' '+stderr.slice(-2000))));child.on('message',value=>{if(value?.action==='proof')done(resolve)(value);});
  });}finally{
   if(child.exitCode===null&&child.signalCode===null)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Own Host did not stop')),10000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');});
   await writeFile(join(output,'official-host.log'),stdout+'\n'+stderr);proof.hostStopped=child.exitCode!==null||child.signalCode!==null;
  }
  assert.equal(proof.officialHost.passed,true,proof.officialHost.error);assert.equal(proof.hostStopped,true);
 }
 proof.passed=true;proof.completedAt=new Date().toISOString();await save();console.log(JSON.stringify(proof,null,2));
}catch(error){proof.passed=false;proof.error=String(error.stack??error);proof.errorDetails=error.details??null;proof.completedAt=new Date().toISOString();await save();console.error(proof.error);process.exitCode=1;}
