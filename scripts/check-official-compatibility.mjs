import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const exactVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
export const OFFICIAL_DESKTOP_FEED='https://download.deepseek.com/dsh-desk/feeds/mac-arm64/nightly-mac.yml';

export function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || manifest.officialPackage !== '@deepseek-ai/dsh'
      || manifest.registry !== 'https://registry.npmjs.org'
      || manifest.officialDesktopFeed !== OFFICIAL_DESKTOP_FEED) throw Error('Invalid official compatibility manifest');
  const versions = manifest.testedHostVersions;
  if (!Array.isArray(versions) || versions.length === 0
      || versions.some(version => typeof version !== 'string' || !exactVersion.test(version))) {
    throw Error('Tested Host versions must be exact versions');
  }
  if (new Set(versions).size !== versions.length) throw Error('Duplicate tested Host versions');
  return manifest;
}

export function assertTestedVersion(manifest, version) {
  validateManifest(manifest);
  if (typeof version !== 'string' || !exactVersion.test(version)) throw Error('Invalid official Host version');
  if (!manifest.testedHostVersions.includes(version)) {
    throw Error(`Untested official Host ${version}: run isolated SDK and Host checks before extending compatibility`);
  }
  return version;
}

export function assertOfficialChannels(manifest,{latest,next,desktop}){
  for(const metadata of [latest,next])if(metadata?.name!==manifest.officialPackage)throw Error('Official npm package identity mismatch');
  for(const metadata of [latest,next])if(typeof metadata.version!=='string'||!exactVersion.test(metadata.version))throw Error('Invalid official SDK channel version');
  assertTestedVersion(manifest,latest.version);
  if(typeof desktop?.version!=='string'||desktop.version.includes('-alpha'))throw Error('Desktop alpha or malformed version is not admitted');
  assertTestedVersion(manifest,desktop.version);
  if(desktop.version!==latest.version&&desktop.version!==next.version)throw Error('Official Desktop does not match exact SDK latest or next');
  return {desktopVersion:desktop.version,sdkNext:next.version};
}

export function desktopVersionFromFeed(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>65536)throw Error('Invalid official Desktop feed');
  const values=[];
  for(const line of text.replace(/^\ufeff/,'').split(/\r?\n/)){
    if(!line.trim()||/^[ \t#]/.test(line))continue;
    const field=/^(?:([A-Za-z_][A-Za-z0-9_-]*)|("version"|'version'))[ \t]*:[ \t]*(.*)$/.exec(line);
    if(!field)throw Error('Unsupported official Desktop feed syntax');
    if((field[1]??field[2].slice(1,-1))==='version')values.push(field[3]);
  }
  if(values.length!==1)throw Error('Official Desktop feed requires one unambiguous version');
  const scalar=/^(?:"([^"]+)"|'([^']+)'|([^\s#]+))(?:[ \t]+#[^\r\n]*)?[ \t]*$/.exec(values[0]);
  const version=scalar?.slice(1).find(value=>value!==undefined);
  if(!scalar||!exactVersion.test(version))throw Error('Invalid exact official Desktop version scalar');
  return {version};
}

export async function checkOfficialCompatibility(args = process.argv.slice(2),{fetchImpl=globalThis.fetch}={}) {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--latest' && !args[0].startsWith('--version='))) {
    throw Error('Usage: node scripts/check-official-compatibility.mjs [--latest | --version=EXACT_VERSION]');
  }
  const manifest = validateManifest(JSON.parse(await readFile(new URL('../compatibility-manifest.json', import.meta.url))));
  const supported = manifest.testedHostVersions.join(' || ');
  for (const name of manifest.packages) {
    const directory = name.split('/').at(-1);
    const pkg = JSON.parse(await readFile(new URL(`../packages/${directory}/package.json`, import.meta.url)));
    if (pkg.name !== name || pkg.engines.dsh !== supported
        || ['@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-storage-domain', '@deepseek-ai/dsh-commands']
          .some(peer => pkg.peerDependencies[peer] !== supported)) {
      throw Error(`Compatibility declaration differs from tested evidence: ${name}`);
    }
  }
  const explicit = args[0]?.startsWith('--version=');
  let version,channels;
  if (explicit) version = args[0].slice('--version='.length);
  else {
    const read=async(url,json)=>{
      const response=await fetchImpl(url,{signal:AbortSignal.timeout(15000),headers:{accept:json?'application/json':'text/yaml'}});
      if(!response.ok)throw Error(`Official channel lookup failed: HTTP ${response.status}`);
      return json?response.json():response.text();
    };
    const [latest,next,feed]=await Promise.all([
      read(`${manifest.registry}/${encodeURIComponent(manifest.officialPackage)}/latest`,true),
      read(`${manifest.registry}/${encodeURIComponent(manifest.officialPackage)}/next`,true),
      read(OFFICIAL_DESKTOP_FEED,false),
    ]);
    channels=assertOfficialChannels(manifest,{latest,next,desktop:desktopVersionFromFeed(feed)});
    version=latest.version;
  }
  assertTestedVersion(manifest, version);
  return {passed: true, checkedAt: new Date().toISOString(), officialPackage: manifest.officialPackage,
    version,...channels,desktopFeed:explicit?undefined:OFFICIAL_DESKTOP_FEED,
    source: explicit ? 'explicit-version' : 'official-desktop-and-npm-channels', testedHostVersions: manifest.testedHostVersions};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(await checkOfficialCompatibility(), null, 2));}
  catch (error) {console.error(JSON.stringify({passed: false, error: error.message})); process.exitCode = 1;}
}
