import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const exactVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || manifest.officialPackage !== '@deepseek-ai/dsh'
      || manifest.registry !== 'https://registry.npmjs.org') throw Error('Invalid official compatibility manifest');
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

export async function checkOfficialCompatibility(args = process.argv.slice(2)) {
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
  let version;
  if (explicit) version = args[0].slice('--version='.length);
  else {
    const response = await fetch(`${manifest.registry}/${encodeURIComponent(manifest.officialPackage)}/latest`, {
      signal: AbortSignal.timeout(15000), headers: {accept: 'application/json'},
    });
    if (!response.ok) throw Error(`Official npm registry check failed: HTTP ${response.status}`);
    const metadata = await response.json();
    if (metadata.name !== manifest.officialPackage) throw Error('Official npm package identity mismatch');
    version = metadata.version;
  }
  assertTestedVersion(manifest, version);
  return {passed: true, checkedAt: new Date().toISOString(), officialPackage: manifest.officialPackage,
    version, source: explicit ? 'explicit-version' : 'official-npm-latest', testedHostVersions: manifest.testedHostVersions};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(await checkOfficialCompatibility(), null, 2));}
  catch (error) {console.error(JSON.stringify({passed: false, error: error.message})); process.exitCode = 1;}
}
