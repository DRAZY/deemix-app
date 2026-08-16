# deemix-remastered — project rules

Project-scoped conventions for this repo. These are invariants that have bitten
repeatedly during real release work, so they live next to the code they govern
rather than in a global config.

## Releases

- **Cosmetic changes re-roll in place.** For minor changes that don't warrant a
  new version (a font-size tweak, a copy fix), move the existing tag and replace
  the release assets with `--clobber` rather than burning a new version number.

- **Keep the local build until the next one starts.** After each rebuild or
  re-roll, leave the current installers in `release/` on disk. Clear that folder
  only at the START of the next rebuild, when those artifacts are about to be
  superseded, never right after pushing the GitHub release. Release assets get
  clobbered to the latest build, so the local copies are the only offline access
  to the current one.

- **Delete superseded artifacts everywhere else.** When rolling a new version,
  remove prior-version build artifacts from both local disk and the GitHub
  releases, keeping only the latest version's builds.

- **Housekeeping ships with the version.** Each rollout audits and updates
  project structure and documentation surfaces so they describe what actually
  changed.

## Branching

- **Features live on an unmerged branch.** New features are built on a dedicated
  local feature branch. Cut local release-candidate builds for testing, and
  merge to main only after the maintainer explicitly confirms no issues.

## Fixes

- **Scope platform fixes to the platform.** Guard platform-specific bugs to the
  affected platform (`isLinux ? 800 : 1024`) rather than moving a shared default.
  Never trade majority-platform UX — spacing, min-width, layout density — for a
  minority-platform or single-user edge case. If a targeted fix can't solve the
  edge case without degrading someone else, leave it as a documented design
  limitation instead of making a global change.

- **Check the reference implementation before blaming this pipeline.** When a
  user disputes an audio-quality or behavior claim, investigate the maintained
  competitor or fork they reference (e.g. original Deemix) for differing API
  endpoints or backend processing such as ReplayGain, before concluding this
  app's own pipeline is at fault.

## Integrating a new service

Adding a data/service source to this multi-source system is not complete after a
single feature-surface sweep. Run progressively deeper passes:

1. Feature-surface walkthrough.
2. Mechanical call-site census — every call to the original source's service,
   checked for source-blindness.
3. Settings-object audit — every setting flows into the new path.
4. Field-level completeness — every metadata/tag field the downstream consumer
   reads is populated by the new source's shim.

Each layer of the Qobuz-alongside-Deezer effort caught gaps the previous layer
missed. Do not stop at layer one.

## Docs and disclaimers

- **Disclaimer coverage is audited per integrated service** across README,
  in-app UI, and docs. Draft new wording sourced from the README, get explicit
  sign-off, and bundle approved text into the next scheduled release.

- **Badges must be live.** Prefer shields.io badges (release version, download
  count, stars, last-commit, open/closed issues) over hardcoded static ones, and
  back a "build passing" badge with a real CI Actions workflow (typecheck +
  build on push) so it reflects actual project health.
