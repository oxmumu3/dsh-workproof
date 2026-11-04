import {readFile,appendFile} from 'node:fs/promises';
import {checkOfficialCompatibility} from '../check-official-compatibility.mjs';
import {matrixFromOfficialMetadata,sdkInstallPlan} from './contracts.mjs';
try{
 const manifest=JSON.parse(await readFile(new URL('../../compatibility-manifest.json',import.meta.url)));
 const official=await checkOfficialCompatibility(['--latest']);
 const versions=matrixFromOfficialMetadata(manifest,{name:manifest.officialPackage,version:official.version});
 if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,'sdk_versions='+JSON.stringify(versions)+'\nhost_versions='+JSON.stringify(versions.filter(version=>sdkInstallPlan(manifest,version).officialHost))+'\n');
 console.log(JSON.stringify({...official,officialLatest:official.version,testedHostVersions:versions},null,2));
}catch(error){console.error(JSON.stringify({passed:false,error:error.message}));process.exitCode=1;}
