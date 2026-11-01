import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateManifest, assertTestedVersion} from './check-official-compatibility.mjs';

const manifest = JSON.parse(await readFile(new URL('../compatibility-manifest.json', import.meta.url)));
const supported = '0.2.0-rc.2 || 0.2.1-rc.3 || 0.2.1-rc.4 || 0.2.1-rc.5';

test('compatibility manifest records only exact tested official Host versions', () => {
  validateManifest(manifest);
  assert.equal(manifest.testedHostVersions.join(' || '), supported);
  for (const version of manifest.testedHostVersions) assertTestedVersion(manifest, version);
});

test('a future official release fails closed until tested', () => {
  assert.throws(() => assertTestedVersion(manifest, '0.2.1-rc.6'), /untested/i);
  assert.throws(() => assertTestedVersion(manifest, '0.2.1'), /untested/i);
  assert.throws(() => assertTestedVersion(manifest, ''), /invalid/i);
});

test('wildcards, ranges and duplicate Host versions cannot become tested evidence', () => {
  for (const version of ['*', '>=0.2.1-rc.5', '^0.2.1', 'latest']) {
    assert.throws(() => validateManifest({...manifest, testedHostVersions: [version]}), /exact/i);
  }
  assert.throws(() => validateManifest({...manifest, testedHostVersions: ['0.2.1-rc.5', '0.2.1-rc.5']}), /duplicate/i);
});

for (const name of ['dsh-delivery-receipts', 'dsh-evidence-ledger']) {
  test(`${name} declares exactly the verified Host versions and current public identity`, async () => {
    const pkg = JSON.parse(await readFile(new URL(`../packages/${name}/package.json`, import.meta.url)));
    assert.equal(pkg.version, '0.1.3-preview.2');
    assert.equal(pkg.engines.dsh, supported);
    for (const peer of ['@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-storage-domain', '@deepseek-ai/dsh-commands']) assert.equal(pkg.peerDependencies[peer], supported);
    assert.equal(pkg.repository.url, 'https://github.com/oxmumu3/dsh-workproof.git');
    assert.equal(pkg.author, '牛村木木山');
    assert.equal(pkg.dependencies.zod, '4.6.6');
  });
}
