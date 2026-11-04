# Official SDK compatibility gates

The rc1 compatibility candidate is 0.1.3-preview.3. Product index/client/service files remain unchanged; package metadata and documentation add only the verified exact rc1 target.
The last published packages remain `@oxmumu3/dsh-delivery-receipts@0.1.3-preview.2`
and `@oxmumu3/dsh-evidence-ledger@0.1.3-preview.2`, published from `c98fe19` by
Trusted Publisher run `41349598621`. Those npm versions are immutable. Their final
SHA-256 values are respectively:

```text
1b8cdceec3646341a0a76afddc79da8ea2bb79ab06202f10fba4ecbe120c4515
9819aee23631150052946560be463c725b9409b57134583d28a416a1313e74fa
```

## Continuous checks

`.github/workflows/sdk-compatibility.yml` runs on pushes, pull requests, manual
requests, and twice daily at 03:17/15:17 UTC. It is also a reusable workflow.
`discover.mjs` independently reads official npm latest/next and the mac-arm64 Desktop feed with timeouts. Desktop must match a reviewed exact SDK latest or next; alpha is never auto-admitted. It validates the
package identity, rejects versions absent from `compatibility-manifest.json`,
checks that package declarations match that list, and emits the exact version
matrix. Missing registry access, malformed metadata and a new untested version
fail the job. The matrix never automatically adds a version or weakens a range.
The latest check runs again after every matrix job succeeds and immediately before
packing or accepting release artifacts. A separate macOS Host matrix covers rc.4/rc.5 and rc1. The full official Web Host keeps
its original Node default memory envelope from the accepted publication runner;
it is separate from the 128 MiB regression processes. A newly imposed 128 MiB
full-Host attempt exhausted its heap, was retained as failed evidence, and was
restored to the known uncapped Host baseline without removing assertions.

Existing SDK jobs use Node 22.22.0; exact rc1 jobs use Node 24.22.1 and Cordis 4.1.0. All jobs retain npm 11.15.0. Exact official SDK services,
their existing Cordis version, and product Zod 4.6.6 are installed without hooks
into temporary directories. Every original source, release-audit and real
Host-service suite runs against that SDK with a 128 MiB inherited Node heap cap
and a 240-second runtime deadline. Nonempty TAP output must contain at least 86
tests (including four process-controller regressions), equal pass/test totals, and zero failures, skips and cancellations. Only the expected SDK/Cordis version
literals change in temporary copies of the two Host test files. The shared adapter selects the exact official legacy or rc1 batch executor API; none of the tool,
command, authority, privacy or persistence assertions is removed. The manifest retains 0.2.0-rc.2 and 0.2.1-rc.3/rc.4/rc.5 and adds 0.2.2-rc.1.

For rc.4, rc.5 and rc1, the same job also installs exact package archives through the
official CLI, checks both enabled/active bundles, and exercises actual receipt and
ledger tools and user commands. The lifecycle proof then disables, restarts disabled, re-enables, restarts enabled, removes both packages and restarts with no remaining tool/command registrations. Actual CLI install/removal runs offline under the OS sandbox after an owned store is warmed before Host startup. The package-manager executable is explicitly
pinned to public pnpm 11.28.5; Corepack does not select a moving version.

All child processes receive an allowlisted environment with new HOME, DSH_HOME,
agent storage, npm configuration and cache paths. Package download/installation
happens before a Host runs and uses the public npm registry with install scripts
disabled. Linux suites run in a private network namespace created by fixed system tools,
then drop to the original UID/GID with no-new-privileges and restore an allowlisted
environment. macOS suites and Host processes run under sandbox-exec. A kernel-level
custom-lookup denial and a denied non-Node Python child must pass before runtime
checks. The JavaScript preload remains an additional diagnostic guard. Host state and fixtures are synthetic, the Web
Host binds to 127.0.0.1, and the runner stops its own process. No production
profile, credential, model or messaging account is supplied. These checks do not
renew Desktop UI, phone receipt or model-driven acceptance.

## Publication dependency and artifact binding

The existing `npm-release.yml` keeps its Trusted Publisher identity, original
packing/artifact checks and original publish implementation. A fresh official
latest check is inserted immediately before the validate job packs archives. After validate uploads its immutable artifact,
it invokes the reusable compatibility workflow with that artifact ID and the
validated run attempt. Each SDK job downloads the same immutable artifact and
checks its name, version, canonical repository, source directory, commit, run ID,
run attempt and SHA-256 before testing. rc.4/rc.5 Host installation uses these
actual archives. The publish job requires both validate and compatibility success.

OIDC permission remains exclusive to the original explicit publish job. The
compatibility workflow has only `contents: read`, inherits no secrets, persists no
checkout credentials, and cannot publish. The publish job still downloads the
artifact ID produced by validate and verifies its immutable hash/context without
executing product code. No dependency download or plugin test runs in that OIDC
job. A CI-only change does not republish an existing package version.

## Local verification

```sh
node --test scripts/ci/contracts.test.mjs
node scripts/ci/discover.mjs
node scripts/ci/run-sdk.mjs --version 0.2.1-rc.5 --output /tmp/workproof-ci-proof
```

For an offline SDK recheck, `--runtime-root /path/to/public-sdk/node_modules`
may select an already installed public runtime. Every expected SDK and Cordis
package version is still checked; Zod and pnpm are freshly installed into a new
synthetic directory. CI never supplies this option. `--artifacts-dir` additionally
requires the exact commit/run/attempt context of its release manifests. Local
fixtures can exercise that binding, but they do not constitute a GitHub Actions
run.

Local macOS validation passed the original 82 checks for every exact SDK and the
rc.4/rc.5 archive Host checks with the portable pnpm executable. A cold full-Host
rc.5 SDK download hit the existing 180-second bootstrap limit on this Mac;
the failure was retained, and no cap was raised. The fresh minimal service-SDK
bootstrap subsequently passed locally. Hosted Linux namespace behavior, macOS
full-SDK cold bootstrap, and GitHub event/reusable-workflow wiring still require an actual run after the
workflow commit is reviewed and integrated. Local YAML parsing and dry execution
do not mean scheduled or publication gates are already active on GitHub.
