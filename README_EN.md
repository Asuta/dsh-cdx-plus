# DSH CDX Plus

**Familiar interactions, a smoother DSH experience.**

Install one suite to get 18 independently switchable features. This repository contains release packages, rebuildable source and runtime resources. Development skills, local notes, test fixtures and machine configuration remain in the development repository.

**Not published yet. After publication:**

    dsh plugin --profile desktop add dsh-asuta-cdx-plus

Open Plugins → DSH CDX Plus to enable or disable individual components. Each feature can also be installed separately; see [README.md](README.md) for the package list. Settings remain in each feature's own UI. Do not enable duplicate development and release versions.

## Validation

    node scripts/verify.mjs
    node scripts/pack.mjs
    node scripts/pack.mjs --local-preview

The optional preview uses local tarballs in a fresh directory and is marked private. Install it only with an isolated DSH_HOME. It is not a registry installation test or a publishable artifact. The regular tarballs retain pinned registry dependencies.

This is an automatically generated release repository. Change source in the development repository and export again; the exporter refuses to overwrite edited release files.

Compatibility baseline: DSH 0.2.2-rc.1. Existing MIT, Apache-2.0 and third-party notices remain attached to their respective packages. Previously unlicensed owned code and the suite use MIT. See [RELEASE_STATUS.md](RELEASE_STATUS.md) for remaining publication steps and acceptance limits.
