# Depic recent issues validation

Updated: 2026-09-05

## 2026-09-05 PR #45 final independent acceptance

### Locked baseline and evidence provenance

- Pull request: [#45](https://github.com/gxy01/depic/pull/45). Source HEAD and remote `refs/pull/45/head` were both `a2761c9555efa0742135545aee2472ceb08940b8` before and after the run; merge base was `7fa17bd56db9953ce8d3e7cd416ad839ed7404d0`. The tracked worktree stayed clean and `pnpm-lock.yaml` stayed at SHA-256 `d4bc23389014e6cd3177956ed3c6cab091f9b919b6d6093ff7f8c935668e126b`.
- Environment: Linux 5.15 x86_64, Node `v22.16.0`, Corepack `0.32.0`, pnpm `10.11.0`. Dependencies were installed in the detached PR worktree with `corepack pnpm install --frozen-lockfile`; the lockfile diff was empty. The monorepo then built successfully in dependency order through its root build script. Focused Core/CLI tests passed `47/47`, workspace typechecks passed, and the complete suite passed `523/523` with one benchmark skipped.
- Actual runtime entry was `packages/cli/dist/cli.js`; ESM resolution from `packages/cli` selected the same worktree's `packages/core/dist/index.js` and `packages/web/dist/index.js`, not a global package or another worktree. Key SHA-256 values: Core runtime `82f9a4b3497c47cd2c6aad4866a8e88709b28b122aa64be12c738f6924905d01`; CLI runtime `127a0523edf77f2656a129ab6c7a2ad542588bee4f860afc5621a20f4a9f8f46`; CLI executable `cea490809edeb920a4923d31cbf28e187c77839d9b8c9025d799b97004ef4438`; Web runtime `517f2ecfaf207de32655dfc93ab3f5f724cafd1b8ad9d9bf9382b968000a0caa`.
- The first build attempt reused package-level workspace links from an older worktree and therefore failed while reading the older Core declarations. That attempt is retained only as discarded environment evidence (`build.log` / `build.retry.log`) and is excluded from every result below.
- Private scratch evidence: `/tmp/depic-traecli-acceptance/pr45-a2761c9/`; its final evidence manifest SHA-256 is `39d3f45b64bc637fdcfc8935d47918c5fe385a27d91fa7cba413065fa478a0e7`. Fixtures contain only synthetic or public data.

### Final PASS/FAIL ledger

| ID | Expected | Actual | Result | Evidence |
|---|---|---|---|---|
| S01 | Git/no-config discovery is read-only and reports merged config plus `.gitignore` delta and confirmation boundary | Repeated stdout was byte-identical and the tree did not change, but JSON has only `root/targets/unknown/diagnostics`; no Git/ignore/config state, merged proposal, or approval boundary | **FAIL** | `discovery-states/git-no-config.{1,2}.json`, `discovery-states/git-no-config.{before,after}.sha256` |
| S02 | Non-Git proposal is read-only and omits Git guidance/mutation | Suggestion itself is read-only, but output does not identify non-Git state or give a config proposal; direct `init` still creates `.gitignore`, so safe onboarding still depends on manual skill branching | **FAIL** | `discovery-states/nongit-no-config.{1,2}.json`, `init/summary.txt` |
| S03 | Existing config keys/targets are preserved in a deterministic merged proposal | Existing config is neither represented nor merged; its existing target is absent from output, although the file remains unchanged | **FAIL** | `discovery-matrix/config-existing.{1,2}.json`, `config-proposal.summary.json` |
| S04 | Legacy targets are read, merged/deduped, and left untouched | Legacy file remains untouched, but its target is neither represented nor merged and no migration proposal exists | **FAIL** | `discovery-matrix/config-legacy.{1,2}.json`, `config-proposal.summary.json` |
| S05 | No pre-approval write; confirmed `init` is idempotent and normalizes legacy ignore rules | Suggestion is read-only; explicit `init` adds one `.depic/` rule, is idempotent, and migrates selective legacy rules. The non-Git guard correctly remains a skill responsibility | **PASS** | `discovery-states/*.{before,after}.sha256`, `init/summary.txt` |
| D01 | pnpm workspace emits exact named package targets in stable order | pnpm-only fixture emitted `@fixture/a`, `@fixture/b`; two outputs byte-identical | **PASS** | `discovery-matrix/pnpm.{1,2}.json`, SHA `461535b...` |
| D02 | npm array/object workspaces share stable schema/order; malformed/unnamed/duplicate are unknown | Both forms emitted identical ordered package IDs; malformed, unnamed, and duplicate manifests emitted stable reasons/diagnostics | **PASS** | `npm-array`, `npm-object`, `workspace-errors` JSON pairs |
| D03 | Yarn-compatible workspaces have the same package semantics | Yarn fixture emitted the same ordered IDs and stable repeated output | **PASS** | `discovery-matrix/yarn.{1,2}.json`, SHA `c9d5769...` |
| D04 | Static/file/lazy routes map route ID to resolved component; chunk comment is ignored | Dedicated fixture resolved `/`, `/static`, and `/lazy` to the component modules; repeated output identical. The original JSX shadow additionally exposed file-route duplicates with `/HomePage` and `/SettingsPage`, so route-declaration quality is not sufficient for full flow | **PASS** | `discovery-matrix/routes.{1,2}.json`; `workspace-router/suggest.1.json` |
| D05 | Nearest tsconfig/jsconfig paths precede bundler alias with explicit resolution source | Basic tsconfig, nearest tsconfig, jsconfig-only, and bundler resolution work. Conflict `/precedence` resolves to bundler `src/bundler/Conflict.tsx`, contrary to the locked tsconfig/jsconfig-before-bundler contract; a nearby tsconfig also blocks root paths and colocated jsconfig paths. Evidence names the resolved file but not the actual config source | **FAIL** | `discovery-matrix/alias.{1,2}.json`, `jsconfig-only.{1,2}.json` |
| D06 | Dynamic/unresolved route is unknown with stable reason, specifier/alias source, and actionable fallback | Dynamic and unresolved routes are not silently omitted and repeated JSON is stable. However the computed import is downgraded to `missing-component` without its specifier, and every unknown lacks structured `fallback`/`recovery` | **FAIL** | `discovery-matrix/routes.{1,2}.json`, `contract-audit.json` |
| I01 | Standard explicit unified diff produces stable valid JSON | Two runs are byte-identical and report the supplied changed file | **PASS** | `history-boundary/live.{1,2}.json`, SHA `02e52ca...` |
| I02 | Entry direct/transitive impact, changed files, and representative chains are correct | Synthetic entry reports direct dependency chain; fan-in fixture reports transitive chains | **PASS** | `history-boundary/live.1.json`, `impact-extra/truncation.1.json` |
| I03 | Provider/consumer package results are unique and explainable | Configured workspace run reports `@fixture/shared` and consumer `@fixture/web`, each with a chain; 4/4 entry/package targets are impacted deterministically | **PASS** | `workspace-impact/configured.{1,2}.json`, SHA `644158d...` |
| I04 | Rename stays incomplete and exposes structured old-path reason/recovery; destination may propagate | Pure and content rename stay incomplete; mapped destination can propagate. But `unresolvedChanges` is empty even with baseline, and no structured reason/recovery exists | **FAIL** | `history-boundary/rename*.json`, `impact-extra/rename-content.{1,2}.json` |
| I05 | Delete without baseline is incomplete with stable reason and executable recovery | Returns `baseline-required` and `--baseline-root /path/to/baseline-checkout` | **PASS** | `history-boundary/delete-no-baseline.{1,2}.json`, SHA `9a2120a...` |
| I06 | Complete baseline proves impact and basis | Returns complete direct impact with baseline chain and `analysisBasis=baseline` | **PASS** | `history-boundary/delete-with-baseline.{1,2}.json`, SHA `ccb482a...` |
| I07 | Root/nested config uncertainty never yields complete-empty; global result has no chain | Nested `package.json` and nested `tsconfig.json` each produce complete global 1/1, name the trigger, and have no chain | **PASS** | `impact-extra/nested-{package,tsconfig}.{1,2}.json` |
| I08 | Parse/resolution failure is incomplete with reason/fallback, never complete-empty | Invalid source yields incomplete `unmapped-file`, but only a generic message; there is no machine-readable parse/resolution reason or recovery | **FAIL** | `impact-extra/parse.{1,2}.json`, SHA `84b464f...` |
| I09 | Missing target stays visible while valid targets still analyze; overall incomplete | Valid `app` remains impacted; missing entry is a warning and report is incomplete | **PASS** | `history-boundary/missing-target.{1,2}.json`, SHA `fb3d0a4...` |
| I10 | Dynamic-route uncertainty retains reason/fallback into the user summary and never becomes zero impact | Product discovery emits an unknown, but the reason is `missing-component`, specifier/fallback are absent, and there is no machine-readable handoff into impact/summary | **FAIL** | `discovery-matrix/routes.{1,2}.json`, `contract-audit.json` |
| I11 | Complete empty is permitted only for fully mapped, warning-free evidence | Mapped unrelated source returns complete zero impacted, no diagnostic/unknown/truncation | **PASS** | `history-boundary/unrelated.{1,2}.json`, SHA `9367182...` |
| I12 | Truncation is incomplete with counts, omitted witness, and CLI/config recovery | Counts, omitted witness, and both recovery forms are present, but top-level `analysisStatus` is `complete` while `truncated=true` | **FAIL** | `impact-extra/truncation.{1,2}.json`, SHA `bdce826...` |
| E01 | Low-manual-step discovery → proposal → confirmation → init/config → impact → explanatory summary | Discovery and impact commands individually run and are deterministic/read-only, but the command omits schema version, Git/config/legacy state, merged config/gitignore proposal, structured fallback, and confirmation payload. Original JSX shadow also proposes path-derived duplicate route IDs rather than configured `/` and `/settings`; manual inspection/editing is still required | **FAIL** | `discovery-states/assertions.json`, `workspace-router/suggest.1.json`, `workspace-impact/configured.1.json` |

### Cross-cutting deterministic and read-only checks

- Within an unchanged project path, every suggestion and impact failure reproduced twice with byte-identical JSON. Workspace-router suggestion SHA-256 was `d5392d3012d5230b93114a98fc4cb62bc2f390f37e4e281b66228b0b90b292d3`; public-self suggestion/report hashes were `0aaaed1bdf5bf20289cdd36db53e40d94af10b6fe4d76b8c832dedc772cc0612` and `0cda4a7aada669af3dbe941776e872e29871291c49100f187956ec7b045c487f`.
- Suggestion tree hashes were unchanged in Git/no-config, non-Git/no-config, existing-config, legacy, and workspace-router runs. No config or target file was written.
- Cross-path portability fails byte identity solely because `root` is an absolute host path. Two byte-identical fixtures at different locations had equal JSON after replacing `root`, but raw stdout differed at line 2 (`discovery-matrix/root-portability.txt`). This violates the locked root-relative public-path invariant even though same-path repeatability passes.
- Public self-shadow passes as a scale smoke: four workspace packages suggested; public impact diff remains complete with one affected package, a representative chain, and stable repeated report.

### Overall verdict and minimal correction list

**Overall: FAIL.** Matrix result: **13 PASS / 11 FAIL**. PR #45 materially improves discovery and fixes the nested-config complete-empty risk, but it does not satisfy the locked one-shot TraeCLI/product contract. Merge/release should be blocked on the failing cells above; no separate issue is needed.

Minimal corrections for the same stabilization change:

1. **Complete the suggestion envelope and merge proposal (S01-S04/E01).** On the existing Git/no-config, non-Git, existing-config, and legacy fixtures, emit a versioned schema with project-relative root, Git/ignore state, config/legacy state, deterministic merged `depic.config.json`, and proposed `.gitignore` delta. Preserve unrelated config keys and existing/legacy targets; keep discovery read-only. Acceptance: two runs byte-identical, before/after tree hashes equal, and each fixture's expected state/proposal is machine-readable.
2. **Honor alias precedence and identify its source (D05).** For `@pick/Conflict` defined by nearest tsconfig and root bundler config, select `apps/web/src/nearest/Conflict.tsx`, then use applicable bundler aliases only after tsconfig/jsconfig. Support jsconfig fallback when the nearest tsconfig does not match, or surface a precise unknown rather than silently masking it. Record the selected config source in evidence.
3. **Make unknowns actionable (D06/I10/I08).** Computed imports must retain a stable dynamic/non-static reason and source expression; all unknown discovery and parse/resolution failures need structured `fallback`/`recovery`, not prose-only diagnostics. Acceptance: `/dynamic`, `/missing`, malformed/duplicate manifests, and broken source each expose machine-consumable reason plus recovery without disappearing or becoming zero impact.
4. **Add structured rename recovery (I04).** Represent old-path uncertainty in `unresolvedChanges` (or an equivalent stable object) with old/new paths, reason, and an executable baseline recovery. Supplying a valid baseline must actually analyze the old path or clearly preserve the unresolved object.
5. **Make truncation incomplete (I12).** When any target or report is truncated, set `analysisStatus=incomplete` while retaining current counts, omitted witness, and CLI/config recovery.
6. **Avoid duplicate/wrong route proposals in the end-to-end fixture (D04/E01).** When a page is already proven through a route declaration, prefer route IDs such as `/` and `/settings` over additional path-derived `/HomePage` and `/SettingsPage` candidates, or mark the alternatives for deterministic dedupe/confirmation.

### Implementation dependency order and rerun gate

The 11 failing cells are one stabilization dependency chain, not 11 fixture-specific patches:

1. **Contract primitives — S01/S02/S03/S04/D06/I08/I10/I12 (8 FAIL):** first define one versioned suggestion/report schema with project-relative public paths, stable ordering, Git/config/legacy state, and uniform machine-readable `unknown -> reason -> recovery/fallback`. Make truncation an explicit incomplete state in the same contract. Existing config and legacy inputs must be modeled before proposal generation; parse/resolution/dynamic uncertainty must use the same vocabulary.
2. **Resolution and historical evidence — D05/I04 (2 FAIL):** after the contract is stable, enforce nearest tsconfig/jsconfig before applicable bundler alias and record the selected source; represent rename old/new-path uncertainty and baseline recovery through the shared structured unknown/recovery model. Do not special-case individual fixtures.
3. **One-shot orchestration — E01 (1 FAIL):** finally derive a deterministic merged config and `.gitignore` proposal from that schema, dedupe route-declaration and file-route candidates by evidence quality, expose one confirmation boundary, and keep every pre-confirmation operation read-only.

When the PR head changes, keep the `a2761c9555efa0742135545aee2472ceb08940b8` results above as historical evidence only. For the new SHA: (a) rerun the 11 failed cells and their minimal fixtures twice and require byte-identical output plus no-write; (b) only then rerun the complete S/D/I/E golden, all three shadows, and existing impact regression; (c) seal head/status/lockfile/dist hashes before and after. The overall verdict changes only when all blocking cells pass.

No Depic source, active skill, issue, or PR was modified by this acceptance run. The private Web proof remains undisclosed.

## 2026-09-04 stabilizer batch: target discovery and conservative fallback收口

- Added a read-only `depic targets suggest [root]` command that prints deterministic JSON only. It does not write `depic.config.json` or any other config file.
- Target suggestion now covers workspace packages from `package.json` workspaces and `pnpm-workspace.yaml`, plus route/file-entry discovery for common `pages` / `app` layouts and statically proven route declarations.
- Route declaration resolution now uses the same static resolver path as analysis, including nearest `tsconfig.json` / `jsconfig.json` paths and simple bundler aliases from local config files. Lazy imports, static component bindings, malformed manifests, unresolved aliases, symlinks, and out-of-root paths all surface as explicit `unknown` results or diagnostics instead of silent omission.
- Impact analysis now treats nested `package.json`, `tsconfig.json`, `jsconfig.json`, workspace, lockfile, and build-config changes conservatively so they no longer fall through as a quiet zero-impact completion.
- Verification completed locally on the worktree: `corepack pnpm exec tsc -p packages/core/tsconfig.json --noEmit`, `corepack pnpm exec tsc -p packages/cli/tsconfig.json --noEmit`, `corepack pnpm exec vitest run packages/core/src/targets/__tests__/suggest.test.ts packages/cli/src/__tests__/cli.test.ts`, and `corepack pnpm exec oxlint --config oxlintrc.json packages/core/src/targets/index.ts packages/cli/src/index.ts packages/cli/src/cli.ts` all passed.
- The JS bundle was refreshed with `corepack pnpm exec rolldown -c rolldown.config.mjs --clean-dir`. The monorepo root build script still shells out to plain `pnpm` for later package steps; that part exits in this environment, so the source-level verification and JS bundle refresh were done directly with `corepack pnpm`.
- Current state to carry into PR/rebase: the new stabilizer batch is implemented and verified locally, but no PR has been created yet in this turn.
- PR created after rebase and push: [#45](https://github.com/gxy01/depic/pull/45). The PR stays minimal and only exposes the target-suggestion/discovery and conservative fallback changes.
- CI for PR #45 is green on the current head commit (`https://github.com/gxy01/depic/actions/runs/33858978654`), and GitHub reports zero review comments on the PR.

## 2026-09-04 resume: private Web HTML graph-data remediation

- The paused worktree state was preserved intact; no local changes were discarded before resuming.
- The HTML boundary fix is implemented through a single shared graph serialization path in the Web package. The prebuilt shell, fallback shell, CLI `web` / `serve`, and VS Code webview all reuse the same script-safe graph data flow. The browser-facing shell now treats graph content as inert data and keeps the UI deterministic.
- The VS Code webview message path now returns a structured file-details response instead of ad hoc payload handling, keeping the message boundary aligned with the same graph-data hardening.
- Verification after resuming passed on the local worktree: focused VS Code tests passed, VS Code typecheck passed, workspace install was restored cleanly, and the VSIX packaging script produced a valid artifact without rewriting the staged manifest dependency range.
- Reproducible packaging command: `bash packages/vscode/scripts/package.sh`.
- Packaged artifact evidence: `packages/vscode/depic-vscode-0.1.3.vsix` was generated successfully; current SHA-256 `c16329f0283ccb585fb59941fe90ca65a192ef287a3008d174eb74fcde1148af`; the staged manifest preserved `@swc/core` at `^1.11.0`.
- The packaging script now prefers a local `vsce` binary when present and falls back to `npx @vscode/vsce` when needed, so the packaging step remains runnable in this environment without depending on an interactive shell setup.
- Final browser validation was rerun against the saved final artifacts, not the earlier intermediate files. Evidence directory: `/tmp/depic-final-browser-evidence/` with `file-dom.txt`, `serve-dom.txt`, `file.png`, and `serve.png`.
- Browser results on the final artifacts: `file_marker=absent`, `file_ui=present`, `serve_marker=absent`, `serve_ui=present`. The previously observed execution markers do not appear in the final DOM dumps, and the UI still initializes normally.
- Merge commit / validation mapping: PR #44 merged as `7fa17bd56db9953ce8d3e7cd416ad839ed7404d0`. The final browser replay in this section validates the merged commit’s published artifacts: the packaged Web/CLI/VS Code code paths are the same source state that landed in that merge commit, and the evidence files above are the post-merge browser outputs for that exact revision family.
- Final browser replay steps: open `/tmp/depic-round2-web-injection-observable/fixed-final.html` with headless Chromium for the file-backed path, open `/tmp/depic-round2-web-serve/fixed.html` for the saved served snapshot, and verify the DOM dumps in `/tmp/depic-final-browser-evidence/` stay free of execution markers while the application root renders.
- Publish workflow `33850497505` completed successfully for tag `v0.1.19`.
- Registry status now shows `@depic/core@0.1.19`, `@depic/web@0.1.19`, and `@depic/cli@0.1.19` as `latest`; the `@depic/web` tarball is `https://registry.npmjs.org/@depic/web/-/web-0.1.19.tgz`.
- VS Code release lookup for `vscode-v0.1.3` returned `404` from GitHub release metadata, so there is no public repo release/download entry for that tag. The validated local artifact remains `packages/vscode/depic-vscode-0.1.3.vsix` with SHA-256 `c16329f0283ccb585fb59941fe90ca65a192ef287a3008d174eb74fcde1148af`.
- VS Code release mechanics were rechecked again during the final review. The repository still exposes only the npm publish workflow for core/web/cli; there is no repo workflow or release entry that publishes a VS Code extension artifact. The local environment also does not expose a runnable VS Code `code`/`Code` binary or a `@vscode/test-electron` harness, so a true Extension Host/webview E2E cannot be executed here without additional tooling or permissions. This is the current blocking point for a public VS Code release, not a code defect.

## 2026-09-04 continuous scan: public 0.1.18 and private remediation candidate

### Current baseline and private regression

- Clean scan baseline is `origin/main` `002f2de` (`v0.1.18`, the public #42 release). The public npm registry reports `@depic/core`, `@depic/web`, and `@depic/cli` `latest=0.1.18`; a clean installation resolved all three packages to 0.1.18.
- The private Web candidate remains dynamically reproducible on public 0.1.18 through both generated-file and local-server entry points in real headless Chromium. This updates the affected public upper bound to **0.1.18**; there is still no known safe public version. Direct calls to the clean-installed `@depic/web` `generateHtml()` and `generateHtmlFromGraph()` entry points were separately loaded in Chromium and produced the same dynamic result and byte-identical HTML/DOM as CLI `web`; `depic serve` was independently exercised over HTTP. The clean fixture and browser DOM dumps are retained privately. Only boolean observations and SHA-256 evidence were emitted during this cycle; the proof string was not printed or copied.
- Clean-install evidence: Core/Web/CLI all resolved to 0.1.18. The exact public tarball SHA-256 values for Core/Web/CLI are `e2321cf39886498fd77e6da08ebf08dc75ae5689534f9cc7d6302edffaaa4004`, `197b718da1cf33b00481626431ace0493956e55cd5383aed87bf4197b65db51c`, and `c5d471e96087017cae116c9f19e3472ccd0472024aa105f71dc0339df5811fb6`; registry SHA-1 values are `78e421cac0b635a65d2982b8cb1480cd4986220f`, `4e7d05f3fb77d62e62986808cd0654e5a95dd90b`, and `1ab31ba350f0f59de454bf372dbf2de9020c14b6`. The generated file HTML, file/direct-library DOM, and served DOM SHA-256 values are `842f1eddae76eab725d29f4f9feff3c6bd0d4cb68ff13b0c49bc781033350780`, `1231f0423210b0307fcec0d0047604c9ec7e7336a162c07658845cd89e9c7209`, and `4c82d92fda3a49b220a3c555286c6b88f3ace453c3dcfc38283b898982ebe8a0`.
- The 0.1.18 `serve` response did not contain either a Content Security Policy header or `X-Content-Type-Options: nosniff`. This is missing defense-in-depth evidence, not the root defect and not a separate public issue.
- A private remediation candidate is now [PR #44](https://github.com/gxy01/depic/pull/44), commit `c9f8d8c`, against current main. Its CI `lint-test` check is successful, GitHub reports a clean merge state, and there are currently no reviews or comments. No public GitHub issue was created for the finding.
- Rebase gate: `c9f8d8c` has `002f2de` as its direct parent and merge base, so the branch was based on the latest main before PR creation.

### Read-only remediation audit

- The candidate centralizes inert graph-data serialization, applies it to the prebuilt and fallback shells, and uses the same generator for Web API, CLI `web` / `serve`, and VS Code webview output. It adds CSP to the document and mirrors the policy plus `nosniff` on the local HTTP response.
- Graph strings are escaped at the HTML parser boundary while retaining JSON round-trip fidelity. The reviewed field matrix covers file-node `id` and `package`, external-node `id`, and edge `source`, `target`, `kind`, and `specifier`; the generic serializer also covers future nested string fields. The test matrix includes mixed-case script-end text plus `<`, `>`, `&`, quotes, backslashes, U+2028/U+2029, and Unicode. The client reads the inert data element rather than executing an assignment. The prebuilt and fallback shells share the same placeholder renderer, and externally scripted shells fail closed.
- The VS Code message bridge validates message shape before returning file details. This reduces an adjacent trust-boundary ambiguity without broadening the proven impact claim.
- Local read-only verification passed without modifying source files: Web focused tests **11/11**, VS Code tests **6/6**, CLI tests **42/42**, and Web/VS Code/CLI typechecks. Locally packed Core/Web/CLI 0.1.19 tarball SHA-256 values are `99e53369eade0e01765c4d7211f3bd4f69c919da0e28a258e5eb190406fb98a3`, `c3dd4516ae17ac8befba58ae276b0f29bf611ba8de1b39e97e0844ffd8e6cfbf`, and `14fb1e2a58a0a0740c538551a86ecda994b67c50aaeba1c2d58f37b684a4d1dc`; VSIX 0.1.3 SHA-256 is `c16329f0283ccb585fb59941fe90ca65a192ef287a3008d174eb74fcde1148af`.
- A clean install from those local tarballs was also exercised in real Chromium for CLI `web`, CLI `serve`, and direct `@depic/web` `generateHtml()` / `generateHtmlFromGraph()` calls: the prior harmless document-root marker was absent in all cases and the normal application root rendered. Candidate generated HTML, file/direct-library DOM, and served DOM SHA-256 values are `f26bdb9135bf3339561d64cb1aa6f9283e68310bc2dba05fdfd5036b293d306b`, `cf74f1e97a5ec3b0d5d2c3553f03ab051e3f8b650c4c4347e192d587c342db2d`, and `706a4c3a98e7248fac677f41ae728a891b21673fbc9e5273b2bd3f3a88d5d30a`. The `serve` response included both CSP and `X-Content-Type-Options: nosniff`. This is candidate evidence only, not a published safe-version boundary.
- Remaining release gate: a real Extension Host/webview run and post-publish clean-registry browser matrix. Existing tests verify VS Code's shared HTML generator and structured message serialization, but they do **not** yet execute the full webview request/response channel in an Extension Host. Browser-mode UI rendering was observed for the packed CLI paths, while the VS Code file-detail request/response remains unit-level rather than an end-to-end browser assertion. Record the first safe version only after the published artifacts and all relevant surfaces pass.

### Independent scan and candidate dispositions

1. **Private Web P1 — confirmed through 0.1.18; remediation pending merge/release.** Same root cause as PR #44, so no overlapping change or public disclosure was made.
2. **Nested package/tsconfig P2 — still private, contract not established.** Public 0.1.18 retains root-shaped default global-impact patterns. The existing fully synthetic workspace fixtures still show nested `package.json` and nested `tsconfig.json` changes as complete zero-impact informational results. Source, tests, READMEs, ADRs, all public issues, and recent PRs establish that nested manifests/configs affect package identity and resolver behavior, but they do not define whether every nested config change should be globally conservative or package-scoped. Issue #36 concerns read-only target discovery and is not a duplicate. Evidence is sufficient to preserve the candidate, but not to select product behavior or file a public defect.
3. **Baseline/head effective-config P2 — not reproduced under the documented pre-change-checkout contract.** A baseline containing the tracked config returns the expected baseline-proven impact. The zero-impact variant requires an incomplete source-only baseline that omits tracked config/tsconfig while the head has them. Keep this as a misuse-sensitive boundary, not a defect, unless the API contract later promises inherited head configuration for partial baselines.
4. **CLI positional option parsing — private P3 usability candidate only.** Commands with an optional root can interpret a leading option as the root (for example an analyze output flag without an explicit root). This is observable but neither a correctness claim nor a stable CLI contract is established, so it was not filed.
5. **Other Core/CLI/Web checks — no independent new confirmed defect.** The #42 quoted-path regression remains fixed on 0.1.18, the deletion workflow keeps incomplete/baseline evidence semantics, packaged files for all three npm packages are present, and PR #44 owns the Web/CLI/VS Code security-adjacent files.

### Historical deduplication and disclosure decision

- Public issue/PR history through Issue #42 and PR #44 was reviewed. The only open public issue is enhancement #36. None of the non-security P2/P3 observations has both an explicit conflicting contract and a non-duplicate reproducible defect.
- **No new public issue was filed in this cycle.** The P1 remains private; the two requested P2 boundaries remain private/non-confirmed; no candidate met both the correctness-contract and disclosure gates.
- Next cycle: track PR #44 through merge and coordinated release without publishing proof, perform the clean browser/Extension Host/fallback/pack matrix after the candidate stabilizes, then independently verify the first published safe version. Continue scanning unrelated data-to-execution and complete-zero-impact boundaries on the latest main.

## 2026-09-03 Issue #42 implementation and release closure

- Final decision: **accepted P1, fixed, merged, published, and independently smoke-tested**. [PR #43](https://github.com/gxy01/depic/pull/43) merged as `002f2de`; Issue #42 closed automatically. PR CI, post-merge main CI, and Pages all succeeded, with no PR review or inline comment left unresolved.
- Release: annotated tag `v0.1.18`; [publish run 33742563008](https://github.com/gxy01/depic/actions/runs/33742563008) succeeded, including artifact verification and all three publish steps.
- Public registry: `@depic/core`, `@depic/web`, and `@depic/cli` all report version and `latest` as `0.1.18`. The Web package initially entered npm's explicit processing state; closure waited until its tarball returned HTTP 200 and a clean CLI dependency install succeeded.
- Clean registry install: the installed CLI reports `0.1.18`, all three installed packages are `0.1.18`, and the Web client artifact is present. Default quoted and `quotePath=false` raw Unicode diffs produce byte-identical deterministic reports with `changedFiles=["src/café.ts"]`, 1/1 impacted, complete, and no diagnostic. The legal `src/x b/y.ts` case also returns complete 1/1 without a rename warning. Public Core returns the same quoted-path result. The `a//tmp/escape.ts` negative exits 1, states that `/tmp/escape.ts` must be relative, and writes no report.
- Local verification: build and all workspace typechecks pass; lint exits zero; full regression is **512 passed, 1 benchmark skipped**. Dedicated Git-path tests are **37/37** and CLI tests are **42/42**.
- Compatibility/safety boundary: rename and deletion retain their conservative incomplete/baseline behavior; copy no longer inherits rename semantics; malformed escapes, invalid UTF-8, NUL, absolute/device forms, and decoded slash/backslash traversal fail closed. Arbitrary non-UTF-8 Git filenames remain unsupported.
- Public information review passed: the issue, PR, docs, tests, and outputs use only synthetic paths and public repository/package data. No internal project, repository, MR, path, domain, business module, production data, or internal statistic was exposed.

## 2026-09-03 scan: main / public 0.1.17

### Scope and baseline

- Fetched `origin/main` and scanned commit `80db37d` (`v0.1.17`), including the changes released for Issues #31, #33, #34, #35, and #40.
- Reviewed all public issues and pull requests through Issue #42 / PR #41, the impact-analysis ADRs and acceptance documents, and focused tests for symbol refinement, truncation, unmapped files, and deletion analysis.
- Queried the public npm registry directly. `@depic/core`, `@depic/web`, and `@depic/cli` all have `latest=0.1.17`. Clean registry tarballs contain the expected runtime files, pinned cross-package dependencies, declarations, README files, and the Web client artifact.
- Installed `@depic/cli@0.1.17` into a clean directory and exercised the installed CLI, public Core API, and Web HTML generator. After rebuilding the checkout, the repository test suite passed: 472 passed, 1 benchmark skipped. Main CI and the v0.1.17 publish workflow are successful.
- Issue #36 remains an existing design enhancement. It was not duplicated or implemented; the accepted boundary remains workspace-only, read-only, deterministic JSON for the first stage.

## 2026-09-03 private Web HTML execution validation

> Private security finding. Do not copy the raw proof string into a public issue, release note, test fixture, log, or other published artifact before the disclosure path is approved.

### Verdict and priority

**Confirmed, high-confidence P1 security candidate; private only.** This is not a static-string false positive. A harmless inline-script probe originating in a synthetic TypeScript import specifier executed when the generated visualization was loaded, and changed a benign `data-*` attribute on the document root. No public issue, comment, source fix, or pull request was created.

The current comparison points are:

- latest `origin/main`: `002f2de` (the #42 merge); the Web generator is unchanged and remains affected;
- public npm latest: `@depic/core`, `@depic/web`, and `@depic/cli` `0.1.17`; the packaged CLI and Web artifact remain affected;
- private vulnerability reporting is disabled for the GitHub repository and no `SECURITY.md` exists, so ordinary public issue disclosure is not appropriate without an explicit gate.

Historical deduplication found no existing issue, pull request, commit, ADR, or test covering script-safe graph serialization, HTML injection, or XSS. #36 is unrelated and remains workspace-only/read-only/deterministic JSON; #42 is a diff-path parser fix and is also unrelated.

### Minimal synthetic reproduction and dynamic evidence

The fixture contains one TypeScript file and no external or production data. Its bare import specifier contains an HTML parser boundary followed by a harmless inline script whose only action is to set a synthetic `data-*` marker on `document.documentElement`. The exact proof string is intentionally omitted here to reduce accidental redisclosure; the private local fixture is retained under `/tmp` for authorized validation.

File-generation path:

1. Install `@depic/cli@0.1.17` from the public npm registry into a clean directory.
2. Run `depic web <synthetic-root> <output.html>`.
3. Load the generated file in headless Chromium and dump the post-execution DOM.
4. Expected: project-derived graph strings remain data and the marker is absent.
5. Actual: the DOM contains `data-depic-pwned="yes"`, proving that the injected script executed.

Evidence locations and hashes:

- fixture: `/tmp/depic-round2-web-injection-observable/`;
- input source SHA-256: `cfb0d8794be0da14b7e3c8c0b0c95802093440767d08db56e2c2aa64fe7cce3a`;
- generated HTML SHA-256: `842f1eddae76eab725d29f4f9feff3c6bd0d4cb68ff13b0c49bc781033350780`;
- executed DOM dump SHA-256: `4c82d92fda3a49b220a3c555286c6b88f3ace453c3dcfc38283b898982ebe8a0`.

The HTTP path was tested independently with the same harmless technique:

1. Run public `depic serve <synthetic-root> 37654`.
2. Load the returned visualization in headless Chromium.
3. Actual: the DOM contains `data-depic-served="yes"`.

Evidence is under `/tmp/depic-round2-web-serve/`; the served HTML and executed DOM SHA-256 values are `d5dae80a4229747bbcdcf699f0d6de93d589eb8bd656a129acc0b083e22a9b08` and `ba6237dca1721c373f2c408cc75a882a57fbeb0a652676490d20fc09f043a789` respectively.

These browser-observed mutations rule out the alternative explanation that the suspect text merely survives as a static JSON string.

### Trigger chain and affected entry points

The proven chain is:

1. a project-controlled import/export/require specifier is parsed into an external-module identifier and edge `specifier`;
2. `toLightweightJSON()` copies those strings into `nodes` and `edges`;
3. `generateHtmlFromGraph()` calls plain `JSON.stringify(...)`;
4. the result is directly substituted into `window.__GRAPH__ = %%GRAPH_JSON%%` inside an executable `<script>` element;
5. JSON escaping preserves `<` and therefore does not neutralize an HTML script end tag; the HTML parser terminates the data-bearing script and executes the following injected script.

Directly confirmed on public 0.1.17:

- `depic web`: generated self-contained file, dynamically confirmed;
- `depic serve`: HTTP-served visualization, dynamically confirmed;
- `@depic/web` `generateHtml()` / `generateHtmlFromGraph()`: same vulnerable generator used by both confirmed paths.

Code-path affected but not separately executed in an Extension Host during this cycle:

- VS Code `Depic: Show Dependency Graph` calls `generateHtmlFromGraph()`, creates a webview with `enableScripts: true`, and assigns the returned HTML directly to `panel.webview.html`. Tags `vscode-v0.1.1`, `vscode-v0.1.2`, and current main all use this path. This should be treated as affected pending a dedicated Extension Host regression, but the claim is code-path-derived rather than browser-dynamically reproduced here.

Prerequisites and scope:

- an analyzed workspace must contain a graph string with the HTML parser boundary; the proven source is a bare module specifier in otherwise valid TypeScript syntax;
- a user or automation then has to render the generated HTML through the CLI file, local server, Web API consumer, or VS Code graph command;
- analysis and JSON output alone do not execute code; execution begins only when the HTML is parsed in a script-enabled context;
- the demonstrated effect is arbitrary JavaScript execution in the visualization document's origin/security context. The exact capabilities vary across `file:`, local HTTP, embedding applications, and VS Code webviews, so no broader filesystem or host-code execution claim is made without separate evidence.

### Affected and safe version boundary

- Repository introduction: initial commit `e20662f` embedded `JSON.stringify(graph.toJSON())` directly into a classic script body.
- First public npm version: `@depic/web@0.1.0-beta.2` (there is no public `0.1.0-beta.1`). Its shipped `renderHtml()` has the same sink. A harmless graph object passed through that exact published renderer produced `data-depic-beta="yes"` in Chromium, so the earliest public sink is dynamically confirmed. The full beta CLI is separately affected by an unrelated ESM packaging failure and was not used to establish the security behavior.
- `@depic/web@0.1.1` was also dynamically confirmed through its published `generateHtml()` API (`data-depic-boundary="v011"`).
- Every public Web version listed by npm (`0.1.0-beta.2`, `0.1.1`, `0.1.2`, `0.1.4` through `0.1.17`) contains the same direct JSON-to-script serialization bridge and no script-safe transform. The package has no published `0.1.3`.
- Current public latest `0.1.17` is dynamically affected through both file generation and `serve`; current main `002f2de` is unchanged in this code path.
- **No safe public version is known as of this validation.** A future version is safe only after the serialization boundary is fixed and the browser-level regression matrix below passes; a source patch alone is not a released-version boundary.

### Recommended fix boundary

1. Treat every graph string as untrusted at the HTML boundary. Do not sanitize only import specifiers; file IDs, package labels, edge endpoints, and future fields share the sink.
2. Replace raw executable-script interpolation with one central script-safe serialization helper. A robust option is an inert `application/json` data element plus `textContent` parsing, while escaping at least `<` so no case variant of an HTML script end tag can appear in its raw text. If assignment in a script body is retained, use a proven serializer and escape `<`, `>`, `&`, U+2028, and U+2029 before substitution.
3. Apply the helper to the prebuilt client shell and the fallback shell. Keep JSON round-trip fidelity and deterministic output.
4. Add an explicit restrictive CSP/nonced-script design for the self-contained page, local server, and VS Code webview as defense in depth. CSP is not a substitute for making the serialized data script-safe.
5. Publish coordinated fixed versions for all consuming surfaces. Until then, avoid rendering graphs from untrusted workspaces and do not share generated HTML from untrusted inputs.

### Required regression gate

| Surface | Minimum regression |
|---|---|
| Serializer unit | Put the HTML script-end boundary, mixed-case variants, `<`, `>`, `&`, quotes, backslashes, U+2028/U+2029, and Unicode in every graph string field. Assert the data round-trips exactly and no raw project-controlled script terminator can break out. |
| `generateHtmlFromGraph()` | Use a synthetic `DependencyGraph`; parse/render the returned document and assert the harmless DOM marker is absent while nodes and edges remain available. |
| `generateHtml()` / packaged Web | Analyze a one-file synthetic repository using a clean public-style package install; verify safe HTML and normal UI render. |
| CLI `web` | Generate the self-contained file, open it in a real headless browser, assert no probe execution, and confirm the visualization still initializes. |
| CLI `serve` | Load the HTTP response in a real headless browser and make the same assertions; include headers/CSP checks. |
| Fallback shell | Force `dist-client/index.html` unavailable and verify that the minimal fallback uses the same safe serialization. |
| VS Code | Run an Extension Host/webview test for `Show Dependency Graph`: scripts needed by the app still run, the probe does not, graph detail messaging remains functional, and the CSP permits only intended code. |
| Packaging/version | Inspect the packed `@depic/web` and `@depic/cli` tarballs, install them cleanly, rerun browser proofs, and only then declare the first safe version. |

### Private disposition

Keep this finding private pending maintainer security triage. Do not open a normal GitHub issue or include the proof string in public artifacts. A maintainer-authorized remediation should coordinate the Web package, CLI dependency, local server, and VS Code extension, then assign the safe-version boundary only after clean package and browser verification.

## 2026-09-03 independent audit: Issue #42

### Verdict

| Object | Decision | Priority | Reason |
|---|---|---:|---|
| Issue #42, standard Git-quoted paths | **Accept** | **P1** | A valid diff produced by default Git causes both the CLI and public Core API to stop before analysis. The CLI exits 1 and writes no report. This blocks the primary impact workflow for an ordinary repository filename class. |
| Header containing an unquoted path segment ` b/` | **Accept as a related parser boundary** | P2 | Git does not quote an ordinary space. The current greedy header regular expression splits this valid header incorrectly, reports the wrong destination, and returns an incomplete zero-impact result. This is the same parser layer but is not the non-ASCII symptom named in #42. |
| Absolute-path aliasing in current normalization | **Accept as a required safety boundary** | P2 | A path such as `a//tmp/escape.ts` is not rejected. The leading slash is stripped and the path is treated as `tmp/escape.ts` inside the repository. This does not demonstrate an out-of-root read, but violates the path contract and can analyze the wrong in-root file. |
| Copy metadata classified as rename | **Accept as a companion compatibility defect** | P2 | A standard ASCII `copy from` / `copy to` block is accepted but reported as an incomplete rename, even though the source still exists and no old-path baseline is required for copy semantics. |
| Arbitrary non-UTF-8 Git pathname support | **Needs evidence / enhancement** | enhancement | Git pathnames are byte strings, while Depic's API and reports use JavaScript strings. No public contract promises arbitrary-byte filenames. The minimum safe behavior is strict decoding failure, not replacement-character decoding. |

#42 is **not a duplicate**. Searches of every public issue and repository history for `quotePath`, quoted paths, Unicode/non-ASCII paths, and malformed diff headers found only #42. Issues #27 and #40 operate after a rename or deletion path has already been parsed; neither covers Git path tokenization or decoding.

P1 is more appropriate than P2 because default Git output can completely disable the primary CLI/Core operation, not merely reduce precision. It is not P0: 0.1.17 fails closed for the quoted-header reproduction, emits no apparently complete report, and no out-of-root filesystem access was reproduced. A caller that ignores the nonzero exit could still skip analysis operationally, but that is distinct from Depic returning a trusted complete zero-impact result.

The public issue passes the information-safety gate. Its body contains only a synthetic fixture, generic paths, public npm versions, standard Git output, and public errors. It contains no internal repository, path, domain, module, change identifier, production data, or internal statistic.

### Independent CLI and Core reproduction

All results below use a clean public install of `@depic/cli@0.1.17` / `@depic/core@0.1.17`, Git 2.39.5, and generated local repositories.

The common evidence commands were:

```bash
git -C /tmp/depic-issue42-audit -c core.quotePath=true \
  diff --no-ext-diff --binary --output=change.true.diff
git -C /tmp/depic-issue42-audit -c core.quotePath=false \
  diff --no-ext-diff --binary --output=change.false.diff

depic impact /tmp/depic-issue42-audit \
  --diff change.true.diff --report report.true.json
depic impact /tmp/depic-issue42-audit \
  --diff change.false.diff --report report.false.json
```

Core was called with the exact same diff text:

```js
await analyzeImpact({
  root: '/tmp/depic-issue42-audit',
  diff,
  targets: [{ kind: 'entry', id: 'entry', file: 'src/entry.ts' }],
});
```

| Input | Actual 0.1.17 | Expected |
|---|---|---|
| `core.quotePath=true`, `diff --git "a/src/caf\303\251.ts" "b/src/caf\303\251.ts"` | CLI: exit 1, `Invalid unified diff: malformed "diff --git" header.`, no report. Core rejects with the same error. | Decode UTF-8 bytes to `src/café.ts`; report `changedFiles=["src/café.ts"]`, 1/1 impacted, complete. |
| `core.quotePath=false`, `diff --git a/src/café.ts b/src/café.ts` | CLI: exit 0 and report written. Core: `changedFiles=["src/café.ts"]`, 1/1 impacted, complete. | Same; this is the compatibility baseline a fix must preserve. |

There is no CLI/Core divergence in the failing case. The CLI forwards the Core parser error and deliberately does not write a report.

### Real Git pathname evidence

Git's documentation states that `core.quotePath=true` is the default, bytes above `0x80` are octal-escaped, and setting it to false only stops treating those high bytes as unusual. Double quotes, backslashes, and control characters are always escaped; an ordinary space is not. The patch format applies this quoting to the `diff --git` header and extended rename/copy headers, whose paths omit the `a/` and `b/` prefix. See [Git `core.quotePath`](https://git-scm.com/docs/git-config#Documentation/git-config.txt-corequotePath) and [Git patch format](https://git-scm.com/docs/git-diff#_generating_patch_text_with_p).

| Filename/change | `core.quotePath=true` real Git output | `core.quotePath=false` real Git output | Depic 0.1.17 |
|---|---|---|---|
| Modify `src/café.ts` | Header and both markers use `"...caf\303\251.ts"`. | Header and markers contain raw `café.ts`. | true: header error; false: complete and correct. |
| Add `src/新.ts` | Header is quoted with `\346\226\260`; old marker is `/dev/null`; new marker is quoted. | Raw Unicode header/new marker; old marker remains `/dev/null`. | true: header error; false: complete and correct. |
| Delete `src/café.ts` | Header and old marker are quoted; new marker is `/dev/null`. | Raw Unicode header/old marker; new marker remains `/dev/null`. | true: header error; false: parses and preserves the expected baseline-required incomplete deletion fallback. |
| Rename `src/café.ts` to `src/naïve.ts` | Quoted header plus `rename from "src/caf\303\251.ts"` and `rename to "src/na\303\257ve.ts"`. | Raw Unicode header and metadata. | true: header error before metadata; false: destination analyzed with the existing incomplete rename warning. |
| Copy `src/unique.ts` to `src/unique-copy.ts` | ASCII header and `copy from` / `copy to`, unquoted. | Same. | Accepted but mislabeled as rename; 1 impacted, `analysisStatus=incomplete`, diagnostic `renamed-file`. |
| Copy from `src/back\slash.ts` to `src/cöpy.ts` | Header and both copy metadata paths are quoted/escaped. | Backslash source remains quoted; Unicode destination is raw. | Both modes fail at the quoted header. |
| Modify `src/with space.ts` | Unquoted header. Markers end the pathname with a tab delimiter. | Same. | Complete and correct. |
| Modify `src/quo"te.ts` | `\"` in a quoted header and markers. | Still quoted and escaped. | Header error in both modes. |
| Modify `src/back\slash.ts` | `\\` in a quoted header and markers. | Still quoted and escaped. | Header error in both modes. |
| Modify `src/x b/y.ts` | `diff --git a/src/x b/y.ts b/src/x b/y.ts`; Git does not quote the space. | Same. | Misparsed as a rename to `y.ts`: `changedFiles=[]`, 0 impacted, incomplete, `renamed-file` and `unmapped-file`. |

The last row is legal raw Git output, not malformed input. After `diff --git ` is removed, the parser sees:

```text
a/src/x b/y.ts b/src/x b/y.ts
```

The greedy `^a/(.+) b/(.+)$` expression captures:

```text
group 1 = src/x b/y.ts b/src/x
group 2 = y.ts
```

Because those groups differ, the block is classified as a rename and the final parsed destination is `y.ts`, not `src/x b/y.ts`. Core therefore returns `changedFiles=[]`, `impactedTargetCount=0`, and `analysisStatus="incomplete"` with `renamed-file` plus `unmapped-file`. This is a stable missed-impact defect on valid Git output, although the explicit incomplete status prevents it from being a silent complete false negative.

This also proves that a fix cannot simply replace the current regex with “split on whitespace, except inside quotes.” Unquoted spaces are valid, and the header can be ambiguous by itself. The block parser must use and cross-check the decoded marker or extended metadata paths to identify the source/destination boundary safely.

### Parsing-entry audit

| Entry | Current implementation and isolated evidence | Required behavior |
|---|---|---|
| `diff --git` header | Sole source of the default old/new paths. Parsed by `^a/(.+) b/(.+)$`; quoted tokens fail and an unquoted ` b/` inside the path splits incorrectly. | Parse two Git pathname fields, including quoted fields and unquoted spaces, then require exact `a/` and `b/` prefixes after decoding. Use markers/metadata to resolve and validate ambiguous unquoted headers. |
| `---` / `+++` markers | Only exact string equality with `--- /dev/null` or `+++ /dev/null` is used. Normal marker paths are neither decoded nor compared. An isolated raw-Unicode header with quoted octal markers succeeds only because the marker paths are ignored. A crafted `--- a/../../escape.ts` marker is also ignored and the report is complete for the header path. | Parse `/dev/null` only as the null sentinel; otherwise decode, validate containment, and require consistency with header/status. Reject unpaired, unsafe, or contradictory markers. Preserve Git's tab delimiter for unquoted marker paths. |
| `rename from` / `rename to` | Raw suffixes are normalized without Git decoding. With an otherwise raw header and quoted rename metadata, Core returns `changedFiles=[]`, 0 impacted, incomplete, with `renamed-file` and `non-source-file`; the escaped text became the wrong logical path. | Require a complete pair, decode both no-prefix paths with the shared decoder, validate them, and preserve the existing baseline warning for old-path-only consumers. |
| `copy from` / `copy to` | Not parsed. Different header paths are treated as rename. A real ASCII copy therefore gains a false `renamed-file` warning and incomplete status. | Require a complete pair and decode both. Treat the destination as changed/current graph evidence without claiming the source disappeared. If copy semantics remain unsupported, use an explicit conservative copy fallback rather than rename evidence. |

### C-style quoted-path grammar and byte decoding

Git's own `unquote_c_style()` accepts `\a`, `\b`, `\f`, `\n`, `\r`, `\t`, `\v`, `\\`, and `\"`. Its octal form is exactly three digits, the first limited to `0` through `3`; any unknown escape, truncated sequence, or unterminated quote is an error. See [Git `quote.c`](https://github.com/git/git/blob/master/quote.c#L1957-L2074).

The octal units are bytes, not Unicode code points. `\303\251` must first become bytes `c3 a9` and then strict UTF-8 `é`. Decoding each octal independently with JavaScript character codes would produce mojibake (`Ã©`), causing graph misses and possible path collisions. The shared decoder must therefore:

1. tokenize the quoted field before decoding so an escaped quote cannot terminate it;
2. append literal UTF-8 text and decoded octets to one byte sequence;
3. decode that sequence with fatal UTF-8 validation;
4. reject NUL and malformed escape/quote syntax;
5. run prefix, relative-path, and root-containment checks only after decoding.

Git can store non-UTF-8 byte names, but Depic has no byte-path API contract. Replacing invalid bytes with U+FFFD is unsafe because distinct paths can collapse. Strict rejection is the minimum v1 fallback; arbitrary-byte support should remain a separate enhancement unless a representation contract is approved.

### Containment and malformed-input matrix

The common Core command for this table is the `analyzeImpact()` call above with only the shown `diff --git` / metadata field changed.

#### Stable defects or validation gaps

| Input diff field | Actual 0.1.17 | Expected |
|---|---|---|
| `diff --git a//tmp/escape.ts b//tmp/escape.ts` | Accepted; the leading slash is removed and the candidate becomes in-root `tmp/escape.ts`, yielding incomplete/unmapped in the fixture. | Reject as absolute immediately. Never alias an absolute spelling to an in-root file. |
| `rename to /tmp/escape.ts` with an otherwise valid header | Accepted and normalized as an in-root path; incomplete/unmapped in the fixture. | Reject as absolute before graph or filesystem use. |
| `diff --git a/C:/escape.ts b/C:/escape.ts` on Linux | Accepted as a relative spelling and reported incomplete/unmapped. | Apply a portable absolute-path policy and reject drive-absolute paths before platform-specific resolution. Exact Windows runtime behavior was not independently executed. |
| `--- a/../../escape.ts` with a safe matching header path | Marker is ignored; analysis succeeds complete for the header path. | Reject the malformed/inconsistent marker. This is not an out-of-root read in 0.1.17 because the marker is unused, but it becomes security-sensitive as soon as markers are decoded. |

For the absolute-path case, the transformation is exact and reproducible:

```text
raw header after `diff --git `: a//tmp/escape.ts b//tmp/escape.ts
regex old/new captures:         /tmp/escape.ts
after normalizeRelativePath:    tmp/escape.ts
resolved lookup:                <root>/tmp/escape.ts
```

The cause is `replace(/^\.?\//, '')`: the optional dot makes it remove either `./` or `/`. Validation then sees a relative path and root containment cannot distinguish the original spelling. This did **not** escape the analysis root in the reproduction and is not classified as directory traversal. It is a stable contract and correctness defect: an absolute path that must be rejected is instead aliased to the wrong repository-internal path.

#### 符合预期的拒绝

| Input diff field | Actual 0.1.17 | Expected after quoted-path support |
|---|---|---|
| `diff --git a/../escape.ts b/../escape.ts` | Rejects: path must be relative to the analysis root. | Continue rejecting after decoding and before any graph/filesystem lookup. |
| UNC-like `a/\\server\share\escape.ts` | Rejects in the audited Linux runtime after separator normalization. | Continue rejecting explicitly and portably. |
| Quoted encoded absolute path `"a/\057tmp/escape.ts"` | Rejects generically at the unsupported quoted header. | Decode, then reject the resulting leading slash with a clear path error. |
| Quoted encoded traversal `"a/\056\056\057escape.ts"` | Rejects generically at the unsupported quoted header. | Decode to `../escape.ts`, then reject the dot segment. |
| Unknown escape `"a/src/bad\q.ts"` | Rejects generically at the header. | Reject as invalid Git escape; do not pass it through. |
| Invalid UTF-8 octets `"a/src/bad\303\050.ts"` | Rejects generically at the header. | Reject strict UTF-8 decoding; do not replace invalid bytes. |
| NUL `"a/src/bad\000.ts"` | Rejects generically at the header. | Reject; a repository path cannot contain NUL. |
| Unterminated quote | Rejects generically at the header. | Continue rejecting with a specific malformed-path error. |

These generic rejections are safe current behavior, not #42 regressions. They need dedicated tests because adding a permissive decoder could accidentally turn them into accepted paths.

#### 尚不确定项

| Item | Current evidence | Conservative decision |
|---|---|---|
| Arbitrary non-UTF-8 Git byte names | Git supports byte names; Depic has no public encoding contract. | Do not include in #42 v1. Strictly reject; revisit only with an explicit API/report representation. |
| Literal backslash semantics across operating systems | Real Git always quotes it, even with `quotePath=false`. On POSIX it is a legal filename byte; current normalization would incorrectly convert a decoded backslash into `/`. On Windows it cannot be a filename character and can act as a separator. | Do not blindly apply the existing global `\\ -> /` rewrite to decoded Git fields. Preserve it as a literal on POSIX; reject it before filesystem resolution on Windows, or document a narrower portable rejection policy. |
| Drive-relative and device path forms on Windows | Linux accepts `C:/...` after `a/`; Windows behavior was not executed. | Add platform-independent drive/UNC/device tests and reject absolute/device forms before `resolve()`. |
| Header/marker mismatch precedence | Standard Git output is consistent; current parser silently trusts the header. | Fail malformed input rather than selecting one conflicting field. |

### Minimum safe fix boundary for a future candidate

This is an audit boundary, not implementation authorization.

1. Introduce one exact Git pathname-field tokenizer/decoder and use it for header, markers, rename metadata, and copy metadata. Do not maintain four subtly different escape implementations.
2. Match Git's documented escape grammar, including exact three-digit octal bytes and simple escapes. Decode bytes with fatal UTF-8 handling; reject NUL, invalid escapes, trailing characters after a quoted token, and unterminated quotes.
3. Decode before validation. Then require the appropriate prefix (`a/`, `b/`, or no prefix for extended metadata), reject leading `/`, `..` segments, drive/UNC/device absolute forms, and any resolved path outside `root`.
4. Fix absolute aliasing by removing only an explicit `./`, never a bare leading `/`.
5. Preserve Git `/` as the repository separator. Do not reinterpret a decoded literal backslash as a separator on POSIX; prevent it from becoming a separator on Windows.
6. Parse paired rename and copy metadata separately. Retain the conservative baseline fallback for rename old-path consumers. For copy, analyze the destination while retaining the source and do not emit a false rename warning.
7. Cross-check header, marker, and metadata paths/status. Handle pure rename/copy blocks without `---` / `+++`; for content blocks require a consistent marker pair and honor `/dev/null` only as the add/delete sentinel.
8. Preserve fail-closed behavior: malformed or unsafe input must produce a nonzero CLI result/Core rejection and no report. Unmapped graph evidence must remain explicitly incomplete; no decoder failure may become a complete zero-impact result.
9. Preserve deterministic JSON and current raw-Unicode (`quotePath=false`) behavior. Decoded paths must flow consistently into `changedFiles`, graph lookup, exclusions, global-change matching, diagnostics, report keys, and baseline lookup.

### Required candidate test matrix

| Area | Required cases |
|---|---|
| API surface | Public Core API and packaged CLI; successful report and failure/no-report behavior. |
| Git modes | Real Git output for `core.quotePath=true` and `false`, with equivalent results after decoding. |
| Status | Modified, added, deleted, Unicode-to-Unicode rename, ASCII-to-Unicode rename, and copy. |
| Fields | Header, old/new markers including `/dev/null`, rename pair, copy pair, and deliberate cross-field mismatch. |
| Characters | Multibyte UTF-8 octal, mixed literal UTF-8 plus octal, ordinary space, embedded ` b/`, double quote, literal backslash, tab/newline simple escapes. |
| Decoder failures | Unknown escape, short/over-range octal, unterminated quote, trailing garbage, NUL, truncated and invalid UTF-8, and decoded-path collision. |
| Containment | Raw and encoded leading slash, raw and encoded `..` segment, encoded separator, drive/UNC/device absolute forms, and in-root names that merely contain dots. |
| Legal raw-header ambiguity | A real Git file named `src/x b/y.ts`; assert that the parsed destination stays `src/x b/y.ts` and does not become `y.ts`, with equivalent CLI/Core impact output. |
| Absolute-path rejection | `a//tmp/escape.ts` and absolute rename/copy metadata; assert rejection before normalization and prove no alias to `<root>/tmp/escape.ts`. |
| Regression/fallback | Raw ASCII and raw Unicode; rename/deletion baseline behavior; copy not rename; exclusions/global patterns; unmapped-file incomplete status; symbol patch reconstruction. |

### Audit conclusion

Issue #42 is **accepted as P1** and is ready to serve as the baseline for reviewing a future implementation candidate. The quoted-header failure, quoted rename/copy entry points, ` b/` header ambiguity, and absolute-path aliasing are all independently reproducible. Current malformed quoted input fails safely only because all quoted headers are rejected wholesale; that protection must not be lost when support is added.

No implementation, pull request, public comment, or release was created by this audit.

## 2026-09-03 authorized implementation validation: Issue #42

Implementation was subsequently authorized on branch `codex/git-quoted-paths`, based on `origin/main` at `80db37d`. The change remains within the approved parser boundary:

- one Git pathname decoder is shared by the `diff --git` header, `---` / `+++` markers, and paired rename/copy metadata;
- quoted octal units are assembled as bytes and decoded with fatal UTF-8 validation; Git's simple C escapes are supported, while unknown/truncated escapes, NUL, invalid UTF-8, trailing quoted-field data, and unterminated quotes reject;
- decoded paths are checked before graph or filesystem lookup for leading `/`, drive/UNC/device absolute forms, slash- or backslash-delimited `..`, and final root containment;
- raw header split candidates are cross-checked against markers or extended metadata, with a unique equal old/new fallback for metadata-free changes, so the legal `src/x b/y.ts` header is not treated as a rename;
- copy is a distinct parser status and propagates from the current destination without the rename baseline warning; rename and deletion conservative fallbacks are unchanged;
- decoded literal backslashes remain filename characters on POSIX. They reject on Windows rather than being reinterpreted as separators and aliased to another path.

### Candidate result matrix

| Case / input | Candidate actual output | Expected / decision |
|---|---|---|
| Real Git `core.quotePath=true`: `"a/src/caf\303\251.ts"` in header and markers | CLI exit 0; report written; `changedFiles=["src/café.ts"]`; 1/1 impacted; complete; no diagnostic. Core table test matches. | Pass: stable 0.1.17 defect fixed. |
| Same repository with `core.quotePath=false` raw `src/café.ts` | CLI exit 0 with the same decoded path, target count, status, and diagnostics. | Pass: raw-Unicode compatibility preserved. |
| Real Git raw header `a/src/x b/y.ts b/src/x b/y.ts` plus matching markers | CLI exit 0; `changedFiles=["src/x b/y.ts"]`; 1/1 impacted; complete; no `renamed-file`. | Pass: legal Git output no longer yields the prior zero-impact incomplete result. |
| Quoted add/delete/rename/copy and raw ASCII copy | Destination paths decode and propagate. Delete retains `baseline-required`; rename retains incomplete `renamed-file`; both copy cases are complete and have no rename diagnostic. | Pass: existing conservative fallback is retained only where applicable. |
| Independently quoted markers and mixed raw/quoted metadata | Matching values are accepted; deliberate marker/rename/copy contradictions reject with no report. | Pass: each entry point is parsed and cross-checked. |
| `a//tmp/escape.ts` | CLI exit 1: `Path "/tmp/escape.ts" must be relative to the analysis root.`; report absent. | Pass: no root escape was previously shown, but the incorrect `<root>/tmp/escape.ts` alias is removed. |
| Raw/encoded slash or backslash `..`, leading slash, drive/UNC forms, and absolute rename metadata | Core rejects before graph lookup. Encoded octal separators and point segments are decoded first, then rejected. | Pass: unsafe input stays fail-closed. |
| Unknown/short/over-range escape, invalid escaped UTF-8, raw invalid UTF-8 CLI file, NUL, unterminated quote, or unpaired Core surrogate | Explicit rejection; CLI failure writes no report. | Pass: arbitrary non-UTF-8 filenames remain unsupported without replacement decoding. |
| Ordinary spaces, escaped quote/backslash/tab/newline, mixed literal UTF-8 plus octal, and an in-root name containing `..` but no dot segment | Decodes to the exact intended path; valid cases are accepted. | Pass: no broad character or substring rejection. |

### Verification commands and results

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test:run
pnpm exec vitest run packages/core/src/impact/__tests__/git-paths.test.ts
```

- Build and all four workspace typechecks pass.
- Full regression: **512 passed, 1 benchmark skipped** across 37 test files; the dedicated Git-path matrix is **37/37 passed**, and CLI impact tests are **42/42 passed**.
- Lint exits zero. Its warnings are the existing unused fixture/import and generated-template warnings; the Issue #42 changes add no lint error.
- Rebuilt CLI real-Git smoke passes quoted/raw Unicode and the ` b/` filename with complete 1/1 results; the absolute-alias negative exits 1 and leaves no report.

Public documentation and examples contain only synthetic paths and public issue/version references. No internal repository, path, domain, module, production data, or internal statistic was added.

### Ranked candidate results

#### P1 confirmed and filed: Git-quoted non-ASCII paths make valid diffs unparsable

Public issue: [#42 Impact: accept Git-quoted non-ASCII paths in unified diffs](https://github.com/gxy01/depic/issues/42).

Synthetic reproduction:

1. Create `src/entry.ts` importing `./café` and `src/café.ts` exporting one value.
2. Commit the fixture, modify only `src/café.ts`, and generate the input with `git diff --no-ext-diff --binary`.
3. With Git's default `core.quotePath=true`, the diff starts with:

   ```diff
   diff --git "a/src/caf\303\251.ts" "b/src/caf\303\251.ts"
   --- "a/src/caf\303\251.ts"
   +++ "b/src/caf\303\251.ts"
   ```

4. Run the clean public install: `depic impact . --diff change.diff --report report.json`.

Expected: decode the standard Git C-style quoted path, analyze `src/café.ts`, and report the importing entry.

Actual on public 0.1.17: exit 1 with `Invalid unified diff: malformed "diff --git" header.` No report is written. Calling public `analyzeImpact()` with the same diff rejects identically. A pure rename between non-ASCII names fails at the same header.

Root cause evidence: `parseUnifiedDiff()` accepts only the unquoted regular expression `^a/(.+) b/(.+)$` and does not decode Git's quoted-path grammar before normalization.

Historical deduplication: searches across all repository issues for Unicode, non-ASCII, quoted diff paths, quoted headers, and malformed diff headers found no matching issue. #27 and #40 address rename/deletion graph evidence after a path has been parsed; they do not cover parsing of Git-quoted paths.

Privacy gate: passed. The issue contains only a generated public fixture, generic paths, public package versions, standard Git output, and the public error. It contains no internal repository, path, domain, change ID, module, data, or statistic.

#### P2 candidate only: nested workspace configuration changes can be reported as complete zero impact

Synthetic evidence on public 0.1.17:

- A two-package workspace with package targets was configured under `packages/*`.
- A diff changing only `packages/a/package.json` returned `analysisStatus: "complete"`, `impactedTargetCount: 0`, empty `changedFiles`, and an informational `non-source-file` diagnostic.
- A diff changing only `apps/a/tsconfig.json` produced the same result.
- The default global patterns contain root-shaped `package.json` and `tsconfig.json`, not recursive forms.

Why it was not filed: this is a potentially unsafe configuration boundary, but the intended scope is not explicit enough yet. Conservatively making every nested package/tsconfig change global may be too broad, while package-scoped targeting is not represented in the current global-impact contract. Existing Issue #36 discusses discovery, not change impact, so this is not a duplicate; it remains a private candidate pending product intent.

#### P2 candidate only: baseline analysis can use a different effective config from head analysis

Synthetic evidence on public 0.1.17:

- Head used a root `depic.config.json` with `tsconfigPath: "tsconfig.json"`; a separately materialized baseline contained the source files but intentionally omitted that config and tsconfig.
- A deleted dependency reachable only through the alias was mapped as a baseline node, but the baseline reverse edge was absent. The report returned `analysisStatus: "complete"`, `impactedTargetCount: 0`, and said the deletion was analyzed using baseline reverse dependencies.
- Copying the same config and tsconfig into the baseline changed the result to one baseline-proven impacted target. A normal Git worktree from a revision that contains the tracked config therefore behaves correctly.

Why it was not filed: the documentation asks for a pre-change checkout, which normally includes tracked configuration. It is unclear whether callers are permitted to supply only source material while expecting the head's effective overrides to be rebased onto the baseline. This remains a misuse-sensitive candidate rather than a confirmed product defect.

### Non-findings and regressions checked

- The 0.1.17 deletion workflow reports missing baseline evidence as `analysisStatus: "incomplete"` with structured `unresolvedChanges`, and produces `baseline`/`mixed` chains when a valid pre-change checkout is supplied.
- Issue #31 Oxlint directive behavior, #33 static object-member refinement, #34 actionable truncation, and #35 warning/info classification remain covered by the passing suite.
- A simple filename such as `src/with space.ts` is accepted, but this is not a general whitespace guarantee: the legal raw Git path `src/x b/y.ts` is mis-split at its embedded ` b/` and produces an incomplete zero-impact result.
- The clean public Web package generated a self-contained HTML document, and the Core package analyzed a synthetic project through its published export.

### Cycle conclusion

This scan found one new, reproducible correctness/compatibility defect and filed it as Issue #42. Two additional observations remain private candidates because their desired behavior is not yet established. No source fix or pull request was created.

## Ongoing issue search and audit workflow

The recurring workflow is now split into two independently accountable streams:

1. **TraeCLI search stream:** inspect current `main`, recent issues and pull requests, and public npm artifacts; reproduce suspected defects with synthetic fixtures; check historical duplicates and intended limitations; file a public issue only after the evidence and privacy gates pass. It does not implement fixes.
2. **Codex audit stream:** independently assess each candidate or filed issue for reproducibility, historical root cause, scope, compatibility risk, test sufficiency, and public-information safety. The default deliverable is an accept / needs-evidence / duplicate / not-reasonable decision with priority, not an implementation.
3. **gxy gate and acceptance:** deduplicate and prioritize findings, decide whether implementation is authorized, and independently verify any eventual release using a clean public-registry install.

Public issues must remain fully synthetic. They must not contain internal repository names, paths, domains, business modules, change identifiers, production data, or internal statistics. Suspected findings stay private until this gate passes.

Shared Feishu task list: [Depic Issue 检索与审计](https://applink.larkoffice.com/client/todo/task_list?guid=78fd839f-7419-4cc6-abd9-6119f712d3e5). Active task IDs:

- TraeCLI search and filing: `1b33809b-1470-484e-bf20-eb8edba304f0`
- Codex evaluation and audit: `b4f2814d-3bf6-42ca-a808-5f71991af516`

Current cycle starts from the latest repository/public package state. Issue #36 remains design-only and is not implementation approval. Issue #42 is accepted for prioritization and audit only; it is not implementation approval. New findings should be ranked above #36 only when they demonstrate a concrete correctness, false-negative, compatibility, or packaged-artifact defect.

## Conclusion

The original seven-issue hardening set is closed, and each item maps to a merged fix and tagged npm release. Subsequent issues #31, #33, #34, #35, and #40 are also closed and published through `v0.1.17`. The current open public issues are enhancement #36 and accepted P1 defect #42. GitHub CI and the tag-triggered publish workflow for `v0.1.17` succeeded, and the npm registry reports `@depic/cli@0.1.17` as `latest`.

Focused regression tests for the previously fixed issue families pass (127 tests total). Issue #42 and the related raw-header/absolute-alias boundaries are newly reproduced against 0.1.17 and remain unfixed.

The history is a progressive precision-hardening sequence rather than seven unrelated failures:

1. #17 added an explicit impact-only exclusion escape hatch for generated files (0.1.7).
2. #20 replaced the broad generated-barrel false positive with conservative symbol-aware propagation (0.1.8).
3. #22/#23 extended that model to type declarations and checked semantic no-ops (0.1.9).
4. #25 fixed edge cases in directive attachment and documentation-link classification (0.1.10).
5. #28 restored conventional CLI introspection (`--version`, root/subcommand help) (0.1.11).
6. #27 made renamed destinations contribute conservative head-graph impact evidence (0.1.12).

## Validation matrix

| Issue | Historical symptom | Fix/release | Current verification | Remaining boundary |
|---|---|---|---|---|
| #17 | Generated barrel changes fanned out; no impact-only skip | PR #18, v0.1.7 | Exclusion/config regression suite passes | Exclusion means not analyzed and can hide genuine impact |
| #20 | File-level propagation marked unrelated namespace/barrel consumers | PR #21, v0.1.8 | Symbol/barrel regression suite passes | Dynamic/escaped/ambiguous symbols intentionally fall back to file level |
| #22 | Interface/type-alias changes could not refine by declaration | PR #24, v0.1.9 | Type refinement tests pass | Declaration-level only, not field-level |
| #23 | Comment/format-only generated churn propagated impact | PR #24, v0.1.9 | `semantic-noop` tests pass | Requires verified whole-file AST equivalence; not general semantic equivalence |
| #25 | Unchanged directive wrappers and doc links blocked #22/#23 refinements | PR #26, v0.1.10 | Wrapper/directive/link regressions pass | Changed/moved/uncertain directives remain conservative |
| #28 | `--version` and subcommand `--help` exited 1 | PR #29, v0.1.11 | CLI tests pass; installed 0.1.11 also prints version/help | None reproduced |
| #27 | Rename destination was omitted from `changedFiles`, risking missed head consumers | PR #30, v0.1.12 | Pure/edited rename, global rename and CLI report tests pass | Old-path rename consumers remain unresolved; pure deletions gained explicit baseline support in 0.1.17 |

## Evidence

- Repository head: `80db37d`, tagged `v0.1.17`, merge of PR #41.
- PR #30 CI: successful.
- Main CI after merge: successful.
- `v0.1.12` publish workflow: successful; logs show core/web/cli 0.1.12 published.
- npm registry: `@depic/cli` versions include 0.1.12 through 0.1.17 and `latest=0.1.17`.
- Focused tests on a clean `origin/main` worktree:
  - Core issue families: 97/97 passed.
  - CLI regressions: 30/30 passed after the normal workspace build prerequisite.

## Historical assessment

### 1. The central historical problem was precision, not graph reachability

The graph could find dependency paths, but file-level evidence was too coarse around generated barrels, types, comments and directives. The fixes progressively add proof-based pruning while retaining explicit file-level fallback reasons. This is a coherent conservative design.

### 2. #17 was a mitigation, not the final precision fix

`excludeChangedFiles` is deliberately an opt-out. The issue history correctly records that it may hide real changes. #20 is the actual precision improvement for the original generated-barrel scenario. Consumers should not use exclusions as proof of no impact.

### 3. #22/#23 introduced a stricter source-reconstruction dependency

Type-symbol refinement and semantic-noop detection need a diff that reconstructs the checked-out head source. Stale, partial or unsupported hunks must remain conservative. #25 is a natural follow-up caused by physical-offset sensitivity in directive comments, not evidence that #22/#23 were wholly broken.

### 4. #27 is intentionally partial baseline support

0.1.12 analyzes the destination with the head graph and keeps a warning naming the old path. This closes the concrete false-negative gap for current consumers, but did not originally provide baseline-aware analysis. Version 0.1.17 later added explicit baseline support for pure deletions; old-path-only rename consumers still remain an unresolved limitation.

### 5. Release hygiene is good, with one observability caveat

Each fix has tests, documentation, a version tag and successful publishing. Immediately after the publish job, the local/default npm view briefly still returned 0.1.11 while the public registry was processing 0.1.12; a direct registry refresh then showed 0.1.12 as latest. Release verification should tolerate npm propagation delay rather than treating the first stale read as a failed publish.

## Follow-up risks worth tracking (not newly confirmed bugs)

1. Extend the 0.1.17 baseline graph path to old-path rename consumers if precise rename coverage becomes required.
2. Keep field-level type precision as a separate enhancement; current behavior is declaration-level by design.
3. Consider a packaged-CLI smoke test in the publish workflow for `--version`, `impact --help`, and one minimal impact run. Existing publish validation checks root help and package contents, while issue tests cover the other paths in CI.
4. Keep public issues synthetic and minimal; do not paste real repository paths, modules, MRs or production data.

## Published package smoke test

A clean install of `@depic/cli@0.1.12` from `registry.npmjs.org` was tested independently of the repository workspace:

- `depic --version` prints `0.1.12`.
- `depic impact --help` exits successfully and prints the impact options.
- A synthetic 78%-similarity rename diff with an unchanged head consumer reports:
  - `changedFiles: ["src/shared/new-helper.ts"]`;
  - `impactedTargetCount: 1`;
  - dependency chain `src/pages/page.ts -> src/shared/new-helper.ts`;
  - `renamed-file` diagnostic retaining old-path/baseline uncertainty;
  - `precision: file`, `fallbackReason: unsupported-diff`.

This directly validates the packaged artifact for both recent issues #27 and #28.

## One-week change and issue assessment

Review range: `c9f65c3..b2968c4` (v0.1.6 to v0.1.12, 2026-08-27 through 2026-08-31).

### Overall verdict

The issue selection and the implementation direction are mostly reasonable. The work follows a coherent sequence from an explicit escape hatch to proof-based symbol/type/no-op refinement, and then fixes concrete regressions found by synthetic reproductions. The design consistently favors conservative fallback over unsupported precision, which is the correct bias for test-scope impact analysis.

The pace was unusually dense: six releases in five days, 2,625 additions and 60 deletions across 38 files. Roughly 950 additions are source/config, 1,034 are tests, and 641 are documentation/spec. The test and documentation investment is strong, but the release cadence leaves little soak time between interacting precision features.

### What was reasonable

- **Issue #17:** reasonable as a short-term escape hatch, explicitly documented as “not analyzed,” not “unaffected.”
- **Issue #20:** the right root-cause fix for generated barrel fan-out; conservative fallback exists for ambiguous/dynamic syntax.
- **Issues #22/#23:** reasonable extensions of the same proof model to type declarations and checked AST no-ops.
- **Issue #25:** a valid follow-up found at the boundary of #22/#23; attachment-based comparison is better than absolute offsets.
- **Issue #28:** a small but valid CLI usability/automation defect; the implementation is somewhat large because parsing/help was made testable, but the behavior is conventional and well tested.
- **Issue #27:** the compatibility fix is reasonable for a patch release. It repairs head-consumer false negatives without pretending full baseline coverage.

### Confirmed review finding

#### P1: Oxlint directives can be discarded as `semantic-noop`

Location: `packages/core/src/parser/semantic.ts:45-46`.

The protected-comment classifier includes eslint, biome, prettier and other tool markers, but omits `oxlint`. A synthetic change from:

```js
// oxlint-disable no-console
```

to:

```js
// oxlint-enable no-console
```

is classified by published `@depic/cli@0.1.12` as `semantic-noop`, producing 0/1 impacted targets. Running oxlint on the two sources proves the behavior changes: the disabled version exits 0 while the enabled version reports `no-console` and exits 1. This can incorrectly suppress lint/test selection.

Suggested fix: treat oxlint directive comments as protected and add regression cases for enable/disable and rule-list changes.

### Process assessment

- Positive: every issue is synthetic and public-safe; changes have explicit diagnostics, docs/ADRs, tests, tags, and successful publish workflows.
- Positive: full current suite passes (408 passed, 1 benchmark skipped), typecheck passes, lint has 0 errors.
- Concern: issues were often opened and closed within hours, sometimes followed immediately by another issue exposing the previous fix's boundary (#22/#23 -> #25). That is acceptable during rapid hardening, but for a conservative analysis engine a release-candidate soak or a consolidated adversarial corpus would reduce churn.
- Concern: the issue list is driven mainly by observed examples. A small threat model for “unsafe false-negative sources” (directives, loaders/macros, generated pragmas, baseline-only paths, dynamic exports) would turn this into a systematic coverage plan.

### Recommendation

1. Fix the confirmed oxlint directive false negative before relying on Depic to skip validation jobs.
2. Continue using Depic as a conservative recommendation tool, not an authoritative test-skipping gate: 0.1.17 covers pure deletions only when a usable baseline is supplied, while old-path rename analysis remains incomplete and all callers must inspect `analysisStatus` and diagnostics.
3. Slow releases slightly: group related precision fixes into an RC, run the synthetic corpus plus 2-3 real-repo shadow analyses, then promote.
4. Add a table-driven directive corpus rather than maintaining an ad-hoc regex list without negative/positive cases.

## Follow-up

- Filed public synthetic reproduction as Issue #31: https://github.com/gxy01/depic/issues/31
- Requested implementation review from Codex with the expected safety boundary: Oxlint directives must not be pruned, while unchanged wrappers should retain safe refinement.

## Issue #31 public-package regression (0.1.13)

Independent validation used a clean install from `registry.npmjs.org`, not repository build outputs.

- Registry: `@depic/core`, `@depic/web`, and `@depic/cli` all report `0.1.13`; CLI dist-tag `latest=0.1.13`.
- `depic --version`: `0.1.13`.
- `depic impact --help`: successful.
- Oxlint enable/disable in a dependency: 1/1 impacted, file retained, no `semantic-noop`, `directive-comment-changed` conservative fallback.
- Oxlint rule-list change in a dependency: 1/1 impacted, same conservative behavior.
- Oxlint enable/disable in the target file: 1/1 impacted, no `semantic-noop`.
- Stable Oxlint wrapper with only `fetchA` implementation changed: symbol refinement retained; target A impacted and unrelated target B pruned.

Result: Issue #31 is fixed in the published 0.1.13 package with no reproduced regression in the requested boundary cases. PR #32, its CI, and the publish workflow are complete.

## Historical status refresh through 0.1.15

At that checkpoint, public latest was 0.1.15. Main CI and v0.1.15 publish succeeded. A clean install of `@depic/cli@0.1.15` re-ran the Issue #31 dependency-file reproduction and still reported 1/1 impacted with `directive-comment-changed`; the fix had not regressed. Issues #35 and #36 were open then; #35 is now closed in 0.1.16, while #36 remains open.

## Open issue design review (#35 / #36)

Codex assessment was reviewed and accepted with these boundaries:

- #35 is a low-risk diagnostic-classification fix, not an automatic-ignore feature. Global-impact matching must remain higher priority. Paths expected by effective include/exclude/extensions or source-like defaults remain `unmapped-file` warnings; only expected out-of-graph paths become machine-readable `non-source-file` info diagnostics. JSON must retain them and CLI should summarize warning/info separately. Release independently as 0.1.16 and verify custom extensions, include/exclude precedence, parse failures, gitignored sources, and configured global docs.
- #36 should not combine workspace discovery, route AST resolution, alias resolution, and config mutation. MVP is a read-only `depic targets suggest [root]` workspace-manifest discovery command with deterministic JSON and no writes. Route-related `unknown` values are reserved for a later schema-compatible stage and should not imply route discovery in the workspace-only MVP. Any future write path should be an explicit `targets apply` command.

## Issue #35 public-package regression (0.1.16)

Independent validation used a clean `@depic/cli@0.1.16` install from `registry.npmjs.org`. PR #39 is merged, CI and publish succeeded, and all three public package latest tags are 0.1.16.

Passed cases:

- README change -> `non-source-file` / `info`; CLI shows `0 warning(s), 1 info`; JSON retains the diagnostic.
- Unmapped `.ts` source -> `unmapped-file` / `warning`; CLI shows `1 warning(s), 0 info`.
- Custom `.vue` extension -> warning.
- Custom Markdown include -> warning.
- Custom include overridden by exclude -> info.
- Parse-failed source and gitignored source -> warning.
- Configured README global-impact pattern -> global impact takes precedence, with no non-source diagnostic.
- Issue #31 Oxlint dependency-file regression remains fixed: 1/1 impacted with `directive-comment-changed`.

Result: #35 is fixed in the published 0.1.16 package and the requested compatibility matrix passes. #36 remains design-only.

## 2026-09-03 independent audit baseline

### Current public state

- Open public issues: exactly two, [#36](https://github.com/gxy01/depic/issues/36) and [#42](https://github.com/gxy01/depic/issues/42).
- Latest closed correctness issue: [#40](https://github.com/gxy01/depic/issues/40), closed by [PR #41](https://github.com/gxy01/depic/pull/41).
- Current `main`: `80db37d`; current public package: `@depic/cli@0.1.17` (`latest`).
- PR #41 source CI, post-merge CI, and tag-triggered npm publish all completed successfully.
- Public issue bodies reviewed in this cycle (#31, #33, #34, #35, #36, #40, #42) use synthetic names and paths only. No internal repositories, changes, domains, business modules, production data, or internal statistics were found.

### Audit decisions and priority

| Item | Reproduction / current state | Root-cause layer and impact | Decision | Priority | Minimum safe boundary and conservative fallback |
|---|---|---|---|---|---|
| #42: Git-quoted paths | Default Git emits `"a/src/caf\303\251.ts"`; clean CLI 0.1.17 exits 1 with no report and public Core rejects identically. `quotePath=false` succeeds. Legal raw `src/x b/y.ts` is also misparsed to `y.ts`, while `a//tmp/...` is wrongly aliased to in-root `tmp/...`. | Unified-diff pathname tokenizer/decoder and relative-path normalization. The primary quoted case blocks analysis; the raw ` b/` case misses impact but marks the report incomplete; the absolute spelling does not leave root but violates rejection and can map to the wrong in-root file. | **Accept; open and independently confirmed. Not duplicate.** | **P1** | Shared exact Git decoder for header/markers/rename/copy fields; strict byte decoding; cross-field validation; reject malformed/absolute/traversal paths after decoding; preserve nonzero/no-report failure, unknown/incomplete fallbacks, raw Unicode compatibility, rename baseline caution, and deterministic JSON. Detailed evidence and test gate are in the dedicated #42 audit above. |
| #36: target suggestion | Confirmed capability gap: `0.1.17` has no `targets` command; target discovery remains a Skill/manual onboarding responsibility. Not a duplicate of an implemented CLI feature. | CLI onboarding/adaptor gap. It can cause incomplete first-run target configuration, but does not change analysis correctness after targets are confirmed. | **Accept, scope-limited enhancement.** Accept only workspace-manifest package discovery. The route/alias portion needs separate evidence and design; implicit/optional config mutation is not reasonable for v1. This is design approval only, not implementation approval. | enhancement | Read-only `depic targets suggest [root]`; deterministic JSON; no configuration writes. Sort and deduplicate by stable package target identity. Missing, malformed, unnamed, duplicate, escaped, or unsupported workspace entries must remain visible as diagnostics and must never be presented as proof of exhaustive discovery. No route AST, alias resolution, route-shaped `unknown`, or implicit apply in v1. |
| #31: Oxlint directives | Closed by PR #32 and released in 0.1.13. Current focused symbol/no-op suite passes on `main`; the prior public-package reproduction was also rechecked through 0.1.16. | Parser semantic-noop protection. Prior behavior could create a lint/test-selection false negative. | **Accept; fixed and closed.** Not duplicate. | P1 | Any Oxlint directive addition/removal/text/order/range movement stays file-level. Only unchanged wrappers with stable attachment may retain proof-based refinement. |
| #33: exported object members | Closed by PR #37 and released in 0.1.14. Current symbol-impact suite passes. | Symbol analyzer precision. The defect was false-positive fan-out, not missed impact. | **Accept; fixed and closed.** | P2 | Refine only static, non-escaping object members and static reads. Dynamic/computed reads, mutation, whole-object escape, spreads, accessors, unsupported values, and shape uncertainty must fall back to file level. |
| #34: actionable chain truncation | Closed by PR #38 and released in 0.1.15. Current impact/CLI suites pass. | Report/CLI observability. The target remains impacted, but omitted chains could be mistaken for complete evidence. | **Accept; fixed and closed.** | P2 | Preserve successful analysis exit, per-target/report truncation flags, returned/known-minimum counts, one omitted witness, and copyable recovery limits. Consumers must not treat returned chains as exhaustive when `truncated=true`. |
| #35: non-source vs graph gap | Closed by PR #39 and released in 0.1.16. Current classification suite passes. | Changed-file classification. Misclassifying an expected source as informational could hide a graph/discovery false negative. | **Accept; fixed and closed.** | P2 | Effective include/extensions and source-like defaults remain `unmapped-file` warnings and make analysis incomplete; only expected out-of-graph paths are `non-source-file` info. Explicit exclude does not turn source-like paths into proof of no impact. Global-impact matching wins. |
| #40: deletion impact | Public 0.1.16 reproduction was valid. Closed by PR #41 and released in 0.1.17. Clean public-package smoke reproduces both branches: without baseline, `analysisStatus=incomplete` and structured unknown recovery; with baseline, 1/1 target is reached through a baseline dependency chain. | Core impact traversal lacked a pre-change graph. This was a real false-negative if callers treated an empty impact list as complete. | **Accept; fixed and closed.** Not duplicate of rename handling: pure deletions have no head destination. | P1 | `baselineRoot` remains runtime-only and read-only. A usable pre-change graph may prove deletion impact; absent/unusable baseline, unmapped deleted nodes, or unmapped baseline targets must remain `unknown` and incomplete. Exit code zero means the report was written, not that coverage is complete. Rename old-path analysis still remains conservative/incomplete. |
| 0.1.17 documentation wording | Confirmed in current English CLI/Core READMEs: the older “Deleted files remain diagnostic-only” sentence remains under the rename section, while the later 0.1.17 section documents baseline-proven deletion analysis. | Documentation contract only; runtime and JSON behavior are correct. The contradictory wording can mislead integrators about `--baseline-root`. | **Accept as a P3 documentation candidate; wait for approval before editing or filing.** | P3 | Clarify the older sentence as a 0.1.12–0.1.16 historical boundary or point forward to the 0.1.17 baseline section. Do not change runtime behavior. |

No item is classified as duplicate. No open or recent candidate is rejected wholesale. The rejected scope is limited to #36 v1 config mutation and bundled route-AST/alias discovery; those parts should not ride inside the approved workspace-only MVP.

### #36 contract gate

The public issue is broader than the approved implementation boundary. Acceptance of the workspace-only MVP requires all of the following:

1. The command name and behavior are `depic targets suggest [root]`; it reads manifests and emits reviewable JSON only.
2. Output contains only workspace-derived package targets in v1. Route entries, alias interpretation, framework AST logic, and route-related `unknown` placeholders are absent.
3. Output ordering and formatting are deterministic across directory enumeration order and repeated runs. Duplicate package names and conflicting manifests fail visibly instead of winning by traversal order.
4. Discovery never writes `depic.config.json` or another project file. Any future mutation must be a separately authorized, explicit `targets apply` operation.
5. Suggested targets are candidates, not a completeness proof. Unsupported manifest syntax, ignored/out-of-root packages, unnamed workspaces, malformed manifests, and ambiguous ownership must produce visible diagnostics or a non-zero failure, not silent omission.
6. Public examples and diagnostics remain repository-relative and synthetic. They must not expose absolute local paths or any internal project context.

Minimum test gate: npm/yarn `package.json#workspaces` array and object forms, pnpm workspace manifests, stable ordering, duplicate/missing package names, malformed manifests, negative/overlapping globs, ignored/symlinked/out-of-root directories, empty workspaces, repeated runs, stdout JSON purity, stderr diagnostics, and an assertion that no project file changed.

### Verification evidence for the current baseline

- Focused current-source suites: core impact/symbol/type/no-op/unmapped/deletion tests **112/112 passed**; CLI tests **39/39 passed**.
- Current workspace build and focused Core/CLI typechecks pass after the normal declaration-build prerequisite.
- PR #41 review range `a02b65a...96ad2ae`: 20 files, +866/-54. Independent source review found no P0-P2 implementation defect.
- Public `@depic/cli@0.1.17` clean install:
  - `depic --version` prints `0.1.17`; `depic impact --help` includes `--baseline-root`.
  - Without a baseline, a synthetic deleted dependency remains in `changedFiles`, produces `analysisStatus: "incomplete"`, `status: "unknown"`, reason `baseline-required`, and a recovery command.
  - With a pre-change checkout, the same deletion produces `analysisStatus: "complete"`, one direct impacted target, the chain `src/entry.ts -> src/removed.ts`, and `analysisBasis: "baseline"`.
- Existing compatibility suites preserve the conservative boundaries for Oxlint directives, object-member escape/dynamic access, chain truncation, expected-vs-suspicious unmapped files, rename uncertainty, and global-impact precedence.

### Candidate intake baseline for subsequent TraeCLI findings

Each new candidate appended to this thread must include: public version/commit, a minimal synthetic fixture and exact command, observed JSON/exit status, expected contract, historical duplicate search, root-cause layer, affected callers, false-negative and false-positive analysis, compatibility/fallback requirements, test matrix, and a public-information safety check. A candidate stays **needs evidence** until the reproduction and privacy gate both pass. No issue filing, code change, PR, public comment, or release follows from this audit without explicit gxy approval.

## 2026-09-04 independent public 0.1.19 security regression

PR #44 merged as `7fa17bd56db9953ce8d3e7cd416ad839ed7404d0`. Pull-request CI, post-merge CI, GitHub Pages deployment, and npm publishing all succeeded with no review comments. Public registry `latest` is now 0.1.19 for `@depic/core`, `@depic/web`, and `@depic/cli`.

Independent validation used a clean npm install and the retained synthetic fixture, without repository build output:

- `depic web`: real headless Chromium rendered the UI root; graph data is held in the inert `application/json` element; CSP is present; the harmless prior DOM marker did not execute.
- `depic serve`: real headless Chromium rendered the page without the marker; HTTP responses include CSP and `X-Content-Type-Options: nosniff`.
- Public `@depic/web@0.1.19` `generateHtml()` and `generateHtmlFromGraph()`: both rendered in Chromium without marker execution.
- Clean evidence DOM SHA-256: file and served paths both `cf74f1e97a5ec3b0d5d2c3553f03ab051e3f8b650c4c4347e192d587c342db2d`.
- Candidate VSIX `depic-vscode-0.1.3.vsix` exists locally and hashes to `c16329f0283ccb585fb59941fe90ca65a192ef287a3008d174eb74fcde1148af`, but no `vscode-v0.1.3` tag or repository release is published yet. Unit/package validation covers the reused generator and message handler; a real Extension Host round trip remains the final VS Code release gate.

Interim result at that checkpoint: the public npm 0.1.19 Web/CLI path had passed the initial browser replay. The stricter combined safe-version decision is superseded by the final entry matrix and host gate below; the private proof remains undisclosed.

## 2026-09-04 public 0.1.19 final entry matrix and host gate

### Release identity and packaged runtime

- **Merged/published chain:** PR #44 is merged as `7fa17bd56db9953ce8d3e7cd416ad839ed7404d0`; `origin/main` and annotated tag `v0.1.19` resolve to that same commit. Publish workflow `33850497505` succeeded. The public registry at `https://registry.npmjs.org` reports `latest=0.1.19` for Core, Web, and CLI.
- **Independent install:** exact Core/Web/CLI 0.1.19 versions were installed in a new directory with a separate npm cache. `node_modules/@depic/*` contains ordinary directories, not symlinks. The lockfile SHA-256 is `f9d01d6367cbfc6ad817ae30a5693b12352c86430da25eb0a1e8a4448682f1e9`.
- **Resolved package records:** Core resolves to `https://registry.npmjs.org/@depic/core/-/core-0.1.19.tgz` with integrity `sha512-LtJKd9rBRMAezHWknRPUy/5P6FEibjIsS6e3PDQC+UQIE9tGuOsekRi96Doc875bj31STUK6lWvmXhDQ6Amp8Q==`; Web resolves to `https://registry.npmjs.org/@depic/web/-/web-0.1.19.tgz` with integrity `sha512-KpG0qxF0H2B4hff7veCGahpgknObxcr5fVAwa9VlX7l0Jcwf89Z3DONDhj2JHGXR1nOJcKhhUO/5p8UgWp8zYQ==`; CLI resolves to `https://registry.npmjs.org/@depic/cli/-/cli-0.1.19.tgz` with integrity `sha512-edBEWdtbk8ZJrksvAHyJxrgAQy+Cco9ZghVDurrYCLsW5enZ6dzn1IO4+49GY5LpQ67QM45BTBsy8touCLQX0A==`.
- **No nested stale Web:** `npm ls --all` contains one deduplicated Core 0.1.19 and one deduplicated Web 0.1.19. Resolving from the actual CLI entry `/tmp/depic-public-019-final/pkg/node_modules/@depic/cli/dist/cli.js` reaches `/tmp/depic-public-019-final/pkg/node_modules/@depic/web/dist/index.js` and `/tmp/depic-public-019-final/pkg/node_modules/@depic/core/dist/index.js`, both version 0.1.19 and neither a workspace/link path.
- **Tarball SHA-256:** Core `99e53369eade0e01765c4d7211f3bd4f69c919da0e28a258e5eb190406fb98a3`; Web `c3dd4516ae17ac8befba58ae276b0f29bf611ba8de1b39e97e0844ffd8e6cfbf`; CLI `14fb1e2a58a0a0740c538551a86ecda994b67c50aaeba1c2d58f37b684a4d1dc`.
- **Executed runtime SHA-256:** Core `dist/index.js` `f10a4e5c65772cdabc5d733d37cefb7030bc6f6e41c409a03db042487c12dd80`; Web `dist/index.js` `517f2ecfaf207de32655dfc93ab3f5f724cafd1b8ad9d9bf9382b968000a0caa`; Web prebuilt `dist-client/index.html` `726548edaf8cec73fe5e532564018218a1f10eb9e67bad3c8254d024d4cc1bb5`; CLI `dist/cli.js` `c367ebbcfb25cb429ec564893c630558112a25604854a11e15ed8f93778ed576`.
- **Fix-content link:** the hashed public Web runtime contains the merged `serializeEmbeddedGraph` helper, the inert `depic-graph-data` container, escaping for `<`, `>`, `&`, U+2028, and U+2029, CSP generation, and serve-side `nosniff`; the prior executable graph assignment placeholder is absent. This confirms that the runtime hash belongs to the repaired implementation rather than only sharing the expected version number.

### Real Chromium matrix

The retained private synthetic fixture was regenerated for all four public entry points. The browser runner uses visible tab text, the search combobox role/placeholder, and the visible file path rather than treating a rendered first frame or a successful click as sufficient. It observes the post-action state: Graph canvas dimensions, active Tree/File tab, file heading, search result content, cleared input, restored tree, page errors, and the harmless marker. Browser result JSONL SHA-256 is `1f880a939aaf3dab76d11e2f86fd49389f15246e00e1b984f055fa383314df8a`.

| Required entry | Result | Dynamic execution | Observable UI/interaction result |
|---|---|---|---|
| `@depic/web generateHtml()` | **PASS** | Harmless DOM marker absent | Graph/Tree/File tabs present; Graph canvas 800×538; Tree exposes the synthetic file; opening it activates File and shows its heading; search matches it, clearing restores the tree; zero page errors. |
| `@depic/web generateHtmlFromGraph()` | **PASS** | Harmless DOM marker absent | Same rendered and interaction checks passed; zero page errors. |
| CLI `web` | **PASS** | Harmless DOM marker absent | Same rendered and interaction checks passed; zero page errors. |
| CLI `serve` | **PASS** | Harmless DOM marker absent | Same rendered and interaction checks passed; zero page errors. Response includes CSP and `X-Content-Type-Options: nosniff`; captured headers SHA-256 `299c02bfa054887c21fba79ad8400ae1c5ad0daf89ac8e50df7537f2e353b8a2`. |

The four generated HTML files remain byte-identical at SHA-256 `f26bdb9135bf3339561d64cb1aa6f9283e68310bc2dba05fdfd5036b293d306b`. Semantic-state screenshots hash to `c1eba5e883760bf1ce20ff4c44037e6b8c7aecb54c5e10668359b1b927a6de73` or `ca38019f78876f2feaee441bfcbdaf0eda659ed345be33ff43219b21b90dbbbb`, depending on the final UI timing/layout; the structured post-action observations, rather than screenshot byte equality, are the acceptance evidence.

### VS Code Extension Host/webview gate

- **Result: BLOCKED, not passed.** The candidate VSIX 0.1.3 (`c16329f0283ccb585fb59941fe90ca65a192ef287a3008d174eb74fcde1148af`) installed successfully into isolated extension/user/server-data directories, and VS Code Server 1.135.0 listed `gxy01.depic-vscode@0.1.3`. An isolated agent server started and returned the expected commit on `/version`.
- **Exact blocker:** this remote-server distribution contains no browser workbench assets (`vs/code/browser/workbench/workbench.html` and related Web workbench files are absent), so its root route returns HTTP 404 and cannot provide a UI from which to invoke `Depic: Show Dependency Graph`. The host also has no desktop VS Code Electron executable, no Xvfb-compatible display runner, and no `@vscode/test-electron` harness. Therefore no real renderer can open the extension webview here.
- **Substitute checks completed:** isolated VSIX install/version, package integrity, server/agent startup, source and package inspection showing the shared repaired HTML generator, and focused message-handler tests from the candidate review. These are supporting checks only.
- **Still unproved:** real command activation in an Extension Host, actual webview load, absence of the marker inside the VS Code webview renderer, and the live `getFileDetails` -> `fileDetails` message round trip after user navigation. A real desktop or browser-workbench-capable VS Code host must run these steps before this gate can pass.

### Final decision for this cycle

- Public npm 0.1.19 **passes all four required real-Chromium Web/CLI entry gates**, and the executed runtime is demonstrably the artifact containing the repair.
- The separate **VS Code Extension Host/webview gate remains blocked**, so the combined release gate is incomplete. **Do not yet record 0.1.19 as the first safe version.** This is an evidence gap, not evidence that the repaired Web/CLI runtime failed.
- No public issue or proof was disclosed. The nested-config P2 remains private pending an explicit product contract; the baseline/head candidate remains not reproduced under a complete pre-change checkout; #36 retains its workspace-only/read-only/deterministic-JSON boundary.
- Next cycle: run VSIX 0.1.3 in a real desktop or browser-workbench-capable Extension Host, open the synthetic workspace, invoke the dependency-graph command, verify the webview renders and remains inert, then open a file detail and observe the full message round trip. Only if that passes may the combined gate identify 0.1.19 as the first safe Web/CLI version while separately recording the validated VS Code extension version.

## 2026-09-04 one-shot TraeCLI real-scenario acceptance baseline

### Scope and governing contract

This baseline follows the installed `depic-impact-analysis` skill at `/data00/home/gaoxueyuan/.trae/skills/depic-impact-analysis/SKILL.md`. It is an end-to-end acceptance contract for TraeCLI, target discovery, configuration confirmation, `depic impact`, and the user-facing explanation. It does not authorize source changes. All fixtures and future public evidence must be synthetic or public; the private Web proof remains undisclosed. VS Code E2E is outside this batch.

Current executable baseline is public `@depic/cli@0.1.19` and `origin/main` `7fa17bd56db9953ce8d3e7cd416ad839ed7404d0`. The CLI supports `init`, configured or legacy impact targets, diff/report files, and baseline-assisted deletion analysis. It does **not** expose `depic targets suggest`; therefore discovery in this baseline is currently a TraeCLI skill operation rather than a machine-readable CLI operation. This gap is the main subject for the single stabilization change, not a request for multiple issues.

### One-shot acceptance matrix

| ID | Area | Fixture / action | Machine-verifiable golden | Current baseline expectation |
|---|---|---|---|---|
| S01 | No config, Git | Git repo, no config or legacy targets, `.depic/` not ignored | Discovery emits proposal only; no file changes before confirmation; proposal includes merged config plus gitignore delta; one confirmation boundary | Skill-manual discovery; CLI has no suggestion JSON |
| S02 | No config, non-Git | Same source tree without `.git` | No Git command required; no gitignore recommendation or mutation; config proposal remains read-only | Skill-manual discovery |
| S03 | Existing config | Config has unrelated analyzer keys and some targets | Preserve unrelated values and existing targets; merge only confirmed candidates; second run deterministic | Core consumes config; discovery/merge is skill-manual |
| S04 | Legacy targets | `.depic/impact-targets.json` or `depic-targets.json` exists | Treat as migration input; merge/dedupe deterministically; leave legacy file untouched; approval before root config write | `--targets` works; migration is skill-manual |
| S05 | Init / gitignore | Missing, already ignored, and old selective rules | No mutation before approval; after approval `depic init` adds one `.depic/` rule, is idempotent, and migrates selective rules | CLI-supported |
| D01 | pnpm workspace | Workspace manifest plus named nested packages | Candidate JSON includes meaningful package targets with exact names, stable order, source/rationale, no generated/vendor package | Skill-manual discovery |
| D02 | npm workspace | Root workspaces array and object forms | Same target schema/order; malformed, unnamed, duplicate, or out-of-root entries become unknown diagnostics with reason | Skill-manual discovery |
| D03 | yarn workspace | Yarn-compatible workspaces and nested manifests | Same package semantics; package-manager choice does not change IDs/order | Skill-manual discovery |
| D04 | Static routes | Direct and lazy route components | Candidate ID is route path, file is resolved page module, symbol is optional; router remains only for router-wide role | Skill-manual discovery |
| D05 | Aliases | Nearest tsconfig/jsconfig paths, then bundler alias, with file/index probes | Resolution source and root-relative file explicit; deterministic precedence; chunk comments ignored | Skill-manual discovery |
| D06 | Dynamic/unknown route | Computed import or unresolved alias | Candidate is `status=unknown`, with stable reason, unresolved specifier, alias source, and fallback; never silently omitted or called none | Skill contract only |
| I01 | Standard diff | Generate or accept one standard Git unified diff applied to head | Diff under ignored `.depic/`; explicit input path; valid, stable report JSON | CLI-supported |
| I02 | Entry target | Direct entry, direct dependency, transitive dependency | Correct level, changed files, shortest representative chain, stable target order | CLI-supported |
| I03 | Package target | Provider/consumer workspace packages | Provider and reachable consumer package results are unique and explainable | CLI-supported |
| I04 | Rename | Pure rename and rename with content change | Head destination may propagate; old-path uncertainty keeps report incomplete and has reason/recovery | Current warning needs golden audit for recovery |
| I05 | Delete, no baseline | Delete imported source | `analysisStatus=incomplete`; unknown record has stable reason and executable recovery | CLI-supported |
| I06 | Delete, baseline | Complete pre-change checkout supplied | Baseline-proven target/chain and analysis basis; complete only if all evidence maps | CLI-supported |
| I07 | Config change | Root/nested manifest or tsconfig plus custom global patterns | Only contract-defined global files return global; no chain; ambiguous nested config never silently yields complete empty | Root supported; nested boundary remains private |
| I08 | Parse/resolution failure | Invalid source and unresolved import/alias | Warning or unknown with reason/fallback; incomplete; never complete-empty | Requires shadow verification |
| I09 | Unmapped target | Missing entry/package mixed with valid targets | Invalid targets visible as warnings; valid targets still analyze; overall incomplete | CLI-supported |
| I10 | Dynamic route | Discovery cannot resolve route component | Unknown reason/fallback preserved through summary; never converted to zero impact | Skill contract only |
| I11 | Empty result | Valid diff, all targets mapped, changed file provably unreachable | Complete zero impact only with no warning, unknown, or truncation | Requires shadow proof |
| I12 | Truncation | Chain limits reached | Incomplete; diagnostic has target, returned/minimum counts, omitted witness, and CLI/config recovery | CLI-supported |
| E01 | Full skill flow | Discover -> show JSON/rationales -> confirm -> init/config -> diff -> impact -> summary | No pre-confirmation writes; no avoidable manual path editing; summary lists impact, mapping, chain, diagnostics/recovery, and report | To be measured in shadow |

### Golden schema and invariants

The stabilization PR should make target discovery consumable as one deterministic JSON document. Exact field names may evolve once, but it must carry: schema version; root; Git/non-Git and ignore state; missing/existing/legacy config state; resolved suggestions with target, discovery source, stable reason and rationale; unknown candidates with stable reason, root-relative source/specifier and actionable fallback; merged proposed config; and any proposed gitignore change.

1. Repeated runs on unchanged input are byte-identical. Arrays use stable keys; duplicates cannot be resolved by traversal order.
2. Discovery is read-only: hash the project tree before/after while excluding `.git`; no file change is allowed. Config and gitignore writes occur only after explicit user approval through the skill workflow.
3. Every unresolved candidate appears as unknown with non-empty stable reason and actionable fallback; it cannot disappear or be represented as an empty resolved set.
4. Config merge preserves unrelated keys and existing targets. Legacy files are inputs, not deletion candidates. All reported paths are root-relative.
5. Impact may be complete with zero impacted targets only when the diff parsed, every changed file was classified, every configured target was valid/mapped, discovery has no relevant unknown, and the report is not truncated. Otherwise it is incomplete and each uncertainty has a diagnostic or unresolved-change record with reason and recovery.
6. Global results identify trigger files and invent no dependency chain. Rename/delete, parse/resolution failure, unmapped targets, dynamic routes, and truncation receive no claim more precise than their evidence.
7. The compact TraeCLI summary is derived from JSON rather than terminal heuristics and states all unresolved boundaries before suggesting test scope.

### Shadow projects and execution plan

1. **Synthetic `workspace-router` (primary):** Git repo with gitignore; pnpm workspace packages; npm/yarn workspace variants as deterministic subcases; existing/no config snapshots; legacy targets; static/lazy routes; tsconfig alias, jsconfig fallback, bundler alias; one dynamic unresolved route. Covers S01-S05, D01-D06, I01-I03, I07-I10, and E01.
2. **Synthetic `history-boundary`:** minimal entry/dependency graph committed in pre-change and head snapshots. Diffs cover rename, deletion without/with baseline, parse failure, missing target, provable no-impact, and truncation. Covers I04-I06 and I08-I12.
3. **Public Depic repository self-shadow:** use the pinned public repository, discover meaningful package and CLI entry candidates, then analyze one public commit diff. This detects assumptions that work only in tiny fixtures without exposing non-public context.

Temporary fixtures/reports stay under `/tmp` or ignored `.depic/`; this remains the only durable summary. Each run records CLI version/commit, commands, normalized JSON hashes, tree hashes before/after discovery, stdout/stderr/exit status, user-step count, and PASS/FAIL/BLOCKED per matrix ID.

### Baseline verdict before the stabilization PR

- **BLOCKED as a one-shot workflow, by a capability gap rather than an accepted correctness failure:** public 0.1.19 has no target-suggestion command or deterministic suggestion JSON. TraeCLI can inspect and propose targets manually, but that does not satisfy D01-D06/E01.
- Existing `depic impact` already provides much of I01-I12. These capabilities will be exercised as the pre-PR shadow baseline rather than split into issues.
- The installed skill is the contract even where the repository copy contains newer explanatory text. No Depic source or skill file was changed by this acceptance work.
- **Single-PR gate:** evaluate one stabilization PR against the entire matrix. Collect non-security failures in one disposition ledger; do not split them into multiple issues. Security findings remain private.

### Pre-PR shadow execution results

All runs below use public `@depic/cli@0.1.19`; artifacts are private scratch evidence under `/tmp/depic-traecli-acceptance/`. The aggregate evidence index currently hashes to `af1a96a01793cf6f90f80e561537658789972fbda5e1e3dca8942644279fc9c9`.

#### Shadow 1: synthetic workspace/router

- The fixture contains only synthetic pnpm/npm/Yarn workspace manifests, three named packages, static and lazy route declarations, a dynamic route, tsconfig aliases, a bundler alias, Git/non-Git copies, existing/missing config copies, and a legacy target file.
- Read-only inventory snapshots for Git/no-config, non-Git/no-config, existing-config, and legacy states produced unchanged before/after tree hashes. This proves the skill-side inspection can be performed without mutation, but it is supporting harness evidence rather than product suggestion output.
- The inventory found workspace package names and static/lazy route candidates, but its deliberately simple static scanner did not associate the computed dynamic route with a structured unknown. This demonstrates why a product-owned discovery schema and parser are required; heuristic grep/regex output cannot satisfy D04-D06.
- With confirmed config already present, a real impact run for `packages/shared/src/format.ts` returned `analysisStatus=complete`, 4/4 impacted: package targets `@fixture/shared` and `@fixture/web`, and entry targets `/` and `/settings`. Each result includes a dependency chain. Two repeated reports were byte-identical at SHA-256 `644158d199d8be004b2ceeccfe8eefb72b08c5b7a00798319bbc4f5476b44f15`.
- `depic init` is idempotent for missing/already-present/legacy ignore patterns, and migrates old selective rules to `.depic/`. However, the CLI itself also creates `.gitignore` in a non-Git directory. The installed skill correctly says to skip Git/gitignore guidance in that case, so E01 must keep the skill-level Git check and must not blindly invoke `init` for non-Git projects.

#### Shadow 2: synthetic history boundary

| Case | Result | Golden disposition |
|---|---|---|
| Normal dependency change | `complete`, 1/1 direct, head chain present | **PASS** I01/I02 |
| Deleted dependency, no baseline | `incomplete`, 0/1, `status=unknown`, reason `baseline-required`, actionable CLI recovery | **PASS** I05 |
| Same deletion with complete baseline | `complete`, 1/1 direct, baseline chain and `analysisBasis=baseline` | **PASS** I06 |
| Unmapped changed TypeScript file | `incomplete`, zero impact, `unmapped-file` warning | **PASS** I08 safety invariant |
| Valid plus missing entry target | valid target still impacted; missing target warning; overall incomplete | **PASS** I09 |
| Provably unreachable mapped change | `complete`, zero impacted, no diagnostics or unknowns | **PASS** I11 |
| Rename to an unmapped head path | `incomplete`, `renamed-file` plus `unmapped-file` warnings | **PARTIAL** I04: safe status, but there is no structured rename unknown/reason/recovery object comparable to deletion |

Stable report SHA-256 values: no-baseline deletion `9a2120a20649b74dfec3cc8320fec2812c6c43b47273de3a48163f06477afc2d`; baseline deletion `ccb482a8e06d9798b99fc448c19de1653771b10f723ebe0d43e43bccc8c0c793`; normal dependency `02e52ca8b43665a929a006c4fbaa112b84054a9ecc33a3af04086eb764af3357`; unmapped source `33e7904e7dc66c7f8b16000308e9853f97b21f6e5ade08997b8b95b3971b37a2`; missing target `fb3d0a4b46700eb7fc5c5ed9797f492484f2a74517407f47f4c881cb72d67af6`; rename `e1ad8692fd26a26e1a7a9ea284415f335b5c606d314ed85aa89c5ff69f3e6b`; complete empty `e4d51c27fb1b6a22103ffdac98ec1425d5a80318124118175b125cbd0c9ef110`.

#### Shadow 3: public Depic self-analysis

- A public diff from `002f2de` to `7fa17bd` over the Web repair files was analyzed at the pinned public head with two entry and two package targets. The same invocation twice produced byte-identical report SHA-256 `0cda4a7aada669af3dbe941776e872e29871291c49100f187956ec7b045c487f`.
- Result: `analysisStatus=complete`, 1/4 impacted (`@depic/web`, direct), with three changed TypeScript files and representative chains. The changed HTML client shell was retained as `non-source-file` info. No private proof or non-public repository data entered the fixture or report.

#### Pre-PR disposition ledger

1. **FAIL D01-D06/E01:** no product-owned `targets suggest` command or deterministic suggestion JSON; target discovery, migration proposal, unknown-route evidence, and rationale remain manual. This is the primary stabilization scope.
2. **PARTIAL I04:** rename uncertainty safely forces incomplete status, but lacks a structured unknown `reason` and recovery action. Add it to the same stabilization review rather than creating a separate issue.
3. **PASS existing impact safety:** deletion with/without baseline, unmapped changes, missing targets, valid complete-empty, configured entry/package propagation, deterministic reports, and public-repo scale smoke behave conservatively.
4. **Skill integration requirement:** non-Git onboarding must skip `depic init`; blindly running the command would create `.gitignore` even outside Git. Existing-config keys and legacy target files must remain untouched until the single confirmation step.
5. **Pending matrix cells:** npm workspace object form, Yarn-specific discovery semantics, jsconfig/bundler alias precedence, parse-failure reason detail, root/nested configuration changes, dynamic-route unknown output, and truncation remain blocked on the product discovery implementation or are queued for the same final PR run.

Pre-PR overall result: **BLOCKED**, with the impact engine's exercised conservative boundaries passing and the end-to-end low-manual-step discovery/configuration stage missing. No source change or issue was created.

## 2026-09-05 PR #45 stabilizer retest

Current work on the same PR #45 is aligned to the single acceptance ledger and keeps the change set in one branch.

- Target suggestion now carries a schema version plus a read-only proposal envelope with portable root, Git state, ignore state, config state, legacy target inputs, merged proposed config, and a confirmation boundary.
- Resolver precedence now prefers the nearest tsconfig/jsconfig search before bundler aliases, while preserving source metadata on the winning resolution path for evidence.
- Route discovery now prefers route-declaration candidates over duplicate file-route candidates for the same file, and unresolved lazy/component cases keep structured reason/recovery details instead of collapsing to generic unknown.
- Impact reporting now records rename uncertainty with old/new paths and baseline recovery, and truncation is treated as incomplete coverage rather than a complete report.

Remaining work in this retest cycle is confined to verification: rerun the focused target-suggestion, resolver, and impact matrices; confirm the JSON stays byte-stable; then refresh the PR #45 ledger entry with the final pass/fail counts and any residual gaps. No second summary file is being created.
