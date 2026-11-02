import {readFile,appendFile} from 'node:fs/promises';
import {checkOfficialCompatibility} from '../check-official-compatibility.mjs';
import {matrixFromOfficialMetadata} from './contracts.mjs';
try{
 const manifest=JSON.parse(await readFile(new URL('../../compatibility-manifest.json',import.meta.url)));
 const response=await fetch('https://registry.npmjs.org/@deepseek-ai%2fdsh/latest',{signal:AbortSignal.timeout(15000),headers:{accept:'application/json'}});
 if(!response.ok)throw Error('Official npm discovery failed: HTTP '+response.status);
 const metadata=await response.json();const versions=matrixFromOfficialMetadata(manifest,metadata);
 await checkOfficialCompatibility(['--version='+metadata.version]);
 if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,'sdk_versions='+JSON.stringify(versions)+'\n');
 console.log(JSON.stringify({passed:true,officialLatest:metadata.version,testedHostVersions:versions,source:'official-npm-latest',checkedAt:new Date().toISOString()},null,2));
}catch(error){console.error(JSON.stringify({passed:false,error:error.message}));process.exitCode=1;}
