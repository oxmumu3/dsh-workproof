// macOS acceptance against the installed official Desktop distribution.
// Installs the exact archives through its plugin manager in a disposable Web
// profile, then runs every existing Host pipeline assertion with that app's
// bundled services and the installed packages. No model or user profile is used.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';

const app='/Applications/DeepSeek Harness.app/Contents',electron=join(app,'MacOS/DeepSeek Harness');
const safeEnv=()=>Object.fromEntries(['PATH','LANG','LC_ALL','TZ','TMPDIR'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
if(!process.versions.electron){const child=spawnSync(electron,[fileURLToPath(import.meta.url),...process.argv.slice(2)],{env:{...safeEnv(),ELECTRON_RUN_AS_NODE:'1'},stdio:'inherit'});if(child.error)throw child.error;process.exit(child.status??1);}
assert.equal(process.argv.length,4,'Pass the receipt and ledger archives explicitly');
const packages=process.argv.slice(2).map(path=>resolve(path)),root=realpathSync(mkdtempSync(join(tmpdir(),'workproof-desktop-rc3-'))),home=join(root,'dsh-home'),workspace=join(root,'synthetic-workspace');
for(const path of [home,workspace])mkdirSync(path,{recursive:true,mode:0o700});
writeFileSync(join(workspace,'AGENTS.md'),'Only synthetic workproof acceptance fixtures are allowed here.\n',{mode:0o600});
const output=resolve('.local/desktop-rc3-evidence.json'),evidence={startedAt:new Date().toISOString(),root,checks:{},packages:packages.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),bounds:{officialDesktopDistribution:true,disposableProfile:true,syntheticIdentity:true,realToolsCommandsStorage:true,realModel:false,productionProfile:false,realWechat:false}};
const save=()=>writeFileSync(output,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let host,stdout='',stderr='';
async function stop(){if(!host||host.exitCode!==null||host.signalCode!==null)return;host.kill('SIGTERM');for(let n=0;n<100&&host.exitCode===null&&host.signalCode===null;n++)await delay(100);assert.ok(host.exitCode!==null||host.signalCode!==null,'Disposable Host must exit');}
try{
 const archive=join(app,'Resources/app.asar/dsh'),hostPackage=JSON.parse(readFileSync(join(archive,'package.json'),'utf8'));evidence.hostVersion=hostPackage.version;assert.equal(hostPackage.version,'0.2.1-rc.3');save();
 host=spawn(join(app,'Resources/runtime/cli/bin/dsh'),['--profile','web','--no-open','--port','0'],{cwd:workspace,env:{...safeEnv(),DSH_HOME:home,DSH_AGENTS_HOME:join(root,'agents'),DSH_TELEMETRY_DISABLED:'1',DSH_TOOLS_MODE:'native'},stdio:['ignore','pipe','pipe']});host.stdout.on('data',chunk=>stdout+=chunk);host.stderr.on('data',chunk=>stderr+=chunk);
 let url;const deadline=Date.now()+60000;while(!url){if(host.exitCode!==null)throw Error('Disposable Host exited '+host.exitCode);assert.ok(Date.now()<deadline,'Disposable Host readiness timed out');url=/dsh web: (http:\/\/[^\s]+)/u.exec(stdout)?.[1];if(!url)await delay(200);}
 const bootstrap=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(10000)}),cookie=bootstrap.headers.get('set-cookie')?.split(';',1)[0],origin=new URL(url).origin;assert.ok(cookie);evidence.host={origin,pid:host.pid};save();
 const rpc=async(method,args={})=>{const response=await fetch(origin+'/api/'+method,{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method,payload:{args}}),signal:AbortSignal.timeout(45000)});assert.ok(response.ok);const result=await response.json();assert.equal(result.result?.ok,true,JSON.stringify(result.result));return result.result.value;};
 evidence.installations=[];for(const path of packages){const installed=await rpc('pluginManager/installBundle',{spec:path,options:{enabled:true,saveExact:true,requestId:randomUUID()}});assert.equal(installed.application,'applied');assert.equal(installed.packageResult.exitCode,0);evidence.installations.push({application:installed.application,exitCode:installed.packageResult.exitCode});save();}
 const bundles=await rpc('pluginManager/listBundles'),plugins=await rpc('pluginManager/listPlugins');
 evidence.bundles=bundles.filter(row=>['dsh-delivery-receipts','dsh-evidence-ledger'].includes(row.name)).map(row=>({name:row.name,version:row.version,enabled:row.enabled,error:row.error}));
 for(const name of ['dsh-delivery-receipts','dsh-evidence-ledger']){const bundle=evidence.bundles.find(row=>row.name===name);assert.equal(bundle?.version,'0.1.2');assert.equal(bundle?.enabled,true);assert.equal(bundle?.error,undefined);const plugin=plugins.find(row=>row.moduleName===name);assert.equal(plugin?.enabled,true);assert.equal(plugin?.fiberPhase,'active');}
 evidence.checks.officialPluginManagerBothInstalledAndActive=true;save();await stop();
 const tests=[];for(const name of ['host-smoke.mjs','ledger-host-smoke.mjs']){
  let source=readFileSync(new URL(name,import.meta.url),'utf8');
  source=source.replace(/from '(@deepseek-ai\/[^']+)'/g,(_match,id)=>`from ${JSON.stringify(join(archive,'node_modules',id,'lib/index.js'))}`);
  source=source.replace('const require = createRequire(import.meta.url);',`const require = createRequire(${JSON.stringify(join(archive,'package.json'))});`).replaceAll("'4.0.4'","'4.0.5'").replaceAll("'0.2.0-rc.2'","'0.2.1-rc.3'");
  for(const pkg of ['dsh-delivery-receipts','dsh-evidence-ledger'])source=source.replaceAll(`'../packages/${pkg}/index.js'`,JSON.stringify(join(home,'profiles/web/node_modules',pkg,'index.js')));
  const path=join(root,name);writeFileSync(path,source,{mode:0o600});tests.push(path);
 }
 // The official Host supplies peer modules through its loader rather than
 // installing duplicates in each consumer profile. Bind the standalone test
 // process to those exact bundled peers as well; the installed code is intact.
 const loader=join(root,'bundled-peer-loader.mjs');writeFileSync(loader,`import {registerHooks,createRequire} from 'node:module';import {pathToFileURL} from 'node:url';const require=createRequire(${JSON.stringify(join(archive,'package.json'))});const peers=new Map(['@deepseek-ai/dsh-tools','@deepseek-ai/dsh-storage-domain','@deepseek-ai/dsh-commands'].map(id=>[id,pathToFileURL(require.resolve(id)).href]));registerHooks({resolve(specifier,context,nextResolve){return nextResolve(peers.get(specifier)??specifier,context);}});\n`,{mode:0o600});
 const run=spawnSync(electron,['--import',loader,'--test',...tests],{cwd:workspace,env:{...safeEnv(),ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
 writeFileSync(resolve('.local/desktop-rc3-host-tests.log'),run.stdout+'\n'+run.stderr,{mode:0o600});assert.equal(run.status,0,run.stdout.slice(-10000)+run.stderr.slice(-3000));
 evidence.checks.actualBundledToolsCommandsStorageAndPersistence=true;evidence.testOutput=run.stdout.slice(-1500);evidence.completedAt=new Date().toISOString();evidence.phase='passed';save();console.log(JSON.stringify({phase:evidence.phase,hostVersion:evidence.hostVersion,checks:evidence.checks,packages:evidence.packages,evidence:output},null,2));
}catch(error){evidence.phase='failed';evidence.error=String(error);evidence.stderr=stderr.slice(-5000);save();console.error(evidence.error);process.exitCode=1;}finally{await stop();evidence.hostStopped=!host||host.exitCode!==null||host.signalCode!==null;save();}
