import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

for (const name of ['dsh-delivery-receipts', 'dsh-evidence-ledger']) {
  test(`${name} declares only the two verified Host versions and current public identity`, async () => {
    const pkg = JSON.parse(await readFile(new URL(`../packages/${name}/package.json`, import.meta.url)));
    const supported = '0.2.0-rc.2 || 0.2.1-rc.3';
    assert.equal(pkg.version, '0.1.2');
    assert.equal(pkg.engines.dsh, supported);
    for (const peer of ['@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-storage-domain', '@deepseek-ai/dsh-commands']) assert.equal(pkg.peerDependencies[peer], supported);
    assert.equal(pkg.repository.url, 'https://github.com/oxmumu3/dsh-workproof.git');
    assert.equal(pkg.author, '牛村木木山');
    assert.equal(pkg.dependencies.zod, '4.6.6');
  });
}
