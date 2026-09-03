# Production Release and Supabase Migration Runbook

This is the canonical release runbook for Click Web, Supabase, and the mirrored
mobile repository. `click-web/supabase` is the source of truth for shared
migrations and `bind-proximity-connection`; mobile copies are mirrors only.

Use this runbook for any production release. A green partial check, a skipped
workflow, or a successful compiler invocation alone is not release approval.

## Ownership and release boundaries

- Use matching implementation branches in `click-web` and `click`, based on
  the latest `main` in each repository.
- Keep shared Supabase policy in the web repository. Additive shared migrations
  are copied byte-for-byte to the mobile mirror only after the source migration
  is reviewed.
- Ship only backward-compatible containment changes in a time-sensitive
  release. Do not combine a new encryption protocol, broad navigation rewrite,
  or unrelated visual redesign with a production security patch.
- Terra XHigh owns integration and release approval. Delegated review work may
  use Composer 2.5 in non-fast mode when it is available; otherwise Terra
  retains the task rather than silently substituting a different model.

## Required pre-merge evidence

Run every command from a clean checkout at the final branch SHA.

### Click Web

```bash
npm ci
npm run typecheck
npm run lint
npm test -- --ci --coverage --passWithNoTests
npm run build
npm run build:worker
npm run test:e2e
npm audit --omit=dev --audit-level=high
```

The required GitHub checks are CI, OpenNext worker build, web Maestro E2E,
production dependency audit, fresh Supabase database/RLS verification, and
Documentation Integrity. Do not treat a
warning budget, skipped job, `continue-on-error`, muted test, or quarantined
test as a pass.

### Click Mobile

Check out `click-web` beside or inside the mobile checkout and set the source
root explicitly:

```bash
export CLICK_MOBILE_ROOT="../click"
cd "$CLICK_MOBILE_ROOT"
export CLICK_WEB_ROOT="../click-web"
export REQUIRE_CLICK_WEB=1

./gradlew spotlessCheck :composeApp:testDebugUnitTest :composeApp:compileDebugKotlinAndroid :composeApp:assembleDebug
./gradlew :composeApp:assembleRelease :composeApp:bundleRelease
./gradlew :composeApp:compileKotlinIosSimulatorArm64 :composeApp:iosSimulatorArm64Test :composeApp:compileKotlinIosArm64
bash "$CLICK_MOBILE_ROOT/scripts/check-supabase-drift.sh"
bash "$CLICK_MOBILE_ROOT/scripts/test_map_beacons_hub_id.sh"
```

Also build the full iOS app, not just Kotlin framework targets:

```bash
xcodebuild build -project iosApp/iosApp.xcodeproj -scheme iosApp \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$PWD/derivedData-debug-simulator" CODE_SIGNING_ALLOWED=NO

xcodebuild build -project iosApp/iosApp.xcodeproj -scheme iosApp \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath "$PWD/derivedData-release-device" CODE_SIGNING_ALLOWED=NO
```

Run Android and iOS Maestro release validation. Capture screenshots or a
recording of every primary tab and each changed nested screen on both platforms.
Validate normal, loading, empty, offline, denied-permission, recoverable-error,
keyboard, back-navigation, and restoration states. A UI change is not complete
until Android and iOS produce the same user-visible result, except for an
explicitly documented platform convention.

## Documentation and review gate

Update the relevant API contract, privacy/security explanation, event/hub
lifecycle, platform-permission, test, and release notes in the same branch as
the behavior change.

Documentation Integrity validates changed Markdown for local links, shell-script
references, and legacy encryption claims that the current protocol cannot prove.
Do not add claims that messages are end-to-end encrypted or inaccessible to the
service until the versioned E2EE protocol is deployed and verified.

Treat CodeRabbit as evidence, not authority:

1. Mark each finding `valid`, `false positive`, or `out of scope`.
2. Fix every valid P0/P1 finding and include regression coverage.
3. For a false positive, leave concrete type, control-flow, test, platform, or
   database-contract evidence in the review.
4. Never change code solely to silence a speculative comment.
5. Re-run every affected gate after any accepted review change.

## Supabase migration process

Only apply migrations from `click-web`. Do not run a mobile mirror migration
against a Supabase project.

The ordered chain begins with the tracked
`supabase/migrations/20260330000000_legacy_schema_bootstrap.sql` compatibility
foundation. It supplies the legacy relations that feature migrations consume on
a clean reset; its guarded definitions are intentionally additive for projects
that already contain those production objects. Do not run `supabase-setup.sql`
as a prerequisite for a fresh reset. Fresh-reset coverage and upgrade-safe
foundation checks live in `supabase/tests/migration_paths.sql` and
`__tests__/supabase/migrationChain.test.ts`.

The later `supabase/migrations/20260901400000_waitlist_signup_security.sql`
owns the anon waitlist signup policy and grant after
`20260612090000_security_hardening_rls.sql` removes authenticated reads. The
schema bootstrap intentionally creates no waitlist policies, RLS state, or
grants, so rerunning that older migration cannot undo the hardening.

The database test creates sentinel data and a narrow policy on the
already-existing `waitlist` relation, includes the exact tracked bootstrap with
psql `\ir`, and asserts that both survive the rerun without duplication while
the removed blanket authenticated-read policy stays absent. This is the
bounded upgrade-path fixture; it runs inside the test transaction and rolls
back.

### Preconditions

Before any remote operation, confirm all of the following:

1. Final web, Android, and iOS local gates pass on the exact SHAs.
2. Required GitHub checks are green on those SHAs.
3. The implementation branches are updated with current `main`; rerun affected
   gates after that update.
4. The migration is additive and compatible with the currently deployed
   mobile and web clients.
5. Fresh-schema and upgrade-path migration tests pass.
6. Mobile mirror parity succeeds with `REQUIRE_CLICK_WEB=1`.
7. The target Supabase project reference and backup/PITR availability are
   explicitly confirmed by the release owner.
8. No unresolved P0/P1 issue, flaky test, migration ambiguity, or review item
   remains.

### Pinned CLI usage

The migration script must use the repository-pinned Supabase CLI version. Never
use `npx supabase@latest` for a production operation. The pinned version and
its lockfile entry are part of the release artifact.

From `click-web`, link only the explicitly confirmed project, inspect remote
state, and execute the real dry run:

```bash
cd <click-web-checkout>
npx --no-install supabase link --project-ref <confirmed-project-ref>
npx --no-install supabase migration list --linked
npx --no-install supabase db diff --linked
bash scripts/apply-supabase-migrations.sh --dry-run
```

Review the dry-run output and the pending migration list. The dry run must call
the pinned CLI's real `supabase db push --dry-run --include-all`; a printed
command is not evidence. Record the output with the release artifacts.

Apply only after all preconditions pass:

```bash
bash scripts/apply-supabase-migrations.sh
```

The script must invoke the pinned CLI with `supabase db push --include-all`.
If it cannot determine remote migration state, link to the confirmed project,
or complete its safety validation, stop. Do not bypass the script with ad hoc
SQL or an unpinned CLI command.

### Post-apply verification

Immediately after application:

1. Re-run `npx --no-install supabase migration list --linked` and record applied versions.
2. Run schema invariants, RLS/authorization tests, and migration upgrade tests.
3. Run old-client and new-client staging smoke tests.
4. Verify sensitive RPC grants, event-hub relationships, signed media access,
   consent defaults, and error redaction for the released change.
5. Confirm no unexpected destructive data change.

If verification fails, stop before merge. Use a reviewed forward corrective
migration when required; never improvise destructive rollback SQL in production.

## Auto-merge and no-go procedure

Auto-merge is allowed only when all conditions below are true:

- Both worktrees are clean and contain no unrelated user changes.
- Branches are current with `main` and conflicts are resolved.
- All local and required GitHub gates are green on the final SHAs.
- Android, iOS, and web Maestro evidence is attached where the change affects
  the relevant surface.
- Documentation is complete and Documentation Integrity passes.
- Migration dry run, apply, and post-apply verification have completed when a
  migration is included.
- Valid review findings are resolved and false positives have evidence.
- No P0/P1 security issue, flaky test, accessibility blocker, visual regression,
  migration uncertainty, or compatibility concern remains.

Merge `click-web` first with GitHub squash auto-merge. Verify deployment and
backend smoke tests. Then merge `click` with GitHub squash auto-merge, verify
main-branch Android/iOS CI, and build release candidates from the merged SHAs.
Do not force-push or merge directly to `main`.

If `main` advances before merge, update the branch and rerun the full affected
matrix. If post-merge CI or smoke fails, stop the release and revert the safe
code merge; leave additive database structure in place unless a reviewed forward
migration is needed.

Any failed required check, skipped release validation, missing mobile visual
evidence, unresolved high-severity security issue, or migration uncertainty is
an automatic no-go.
