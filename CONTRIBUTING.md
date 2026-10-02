# Contributing to FlowSight

FlowSight's eligible base code has two licensing routes: AGPL-3.0 and a
separately agreed commercial license. Optional private institutional modules,
if introduced, have a distinct boundary; they are not the reason this same-code
licensing is called dual licensing. Third-party conditions remain applicable.

Every contribution must have a sufficient, verified contributor grant before
merge. Repository templates alone do not establish that grant.

---

## 1. Before you open a PR

- Read the [Code of Conduct](./CODE_OF_CONDUCT.md). Participation in this
  community requires respectful behaviour.
- Make sure your change has a clear motivation. For non-trivial changes
  (new features, refactors that touch more than a couple of files, public
  API changes) please **open an issue first** and wait for a green light
  before you start coding. This saves us both time.
- Keep changes **focused and small**. One PR = one concern. Reviews are
  faster on 200 LOC than on 2000 LOC.
- Match the existing coding style:
  - Rust: `cargo fmt` and `cargo clippy --all-targets -- -D warnings`.
  - TypeScript/JS: the project's ESLint + Prettier config.
  - Python: `black` and `ruff`.
- Add or update tests when the change is testable.
- Update documentation when you change user-visible behaviour.

## 2. Contributor License Agreement (CLA)

You must sign **one** of these before your PR can be merged:

- **Individuals** (you are contributing your own code, in your own time, or
  your employer has given you permission to contribute personally):
  sign [`CLA.md`](./CLA.md).
- **Companies** (your employer wants multiple employees to contribute on
  its behalf): have an authorized signatory execute
  [`CLA-CORPORATE.md`](./CLA-CORPORATE.md).

### Signature verification

Complete and execute the applicable agreement through the
[CLA process](docs/licensing/CLA-PROCESS.md). A maintainer verifies identity,
authority, agreement version/hash, covered submissions and third-party exclusions
in a restricted registry before merge. Do not attach signed documents or personal
identification to public PRs. Contact **manuel@flowsight.site** to arrange delivery.

An automated bot is not assumed to be installed. Opening a PR does not sign a CLA.
New templates do not amend old agreements or cover earlier work automatically.

### Why a CLA?

Because the project is dual-licensed (AGPL + commercial), the maintainer
must hold a broad enough license from every contributor to be able to keep
distributing contributions under **both** licenses. Without that grant,
accepting a PR would either fragment the license situation or stop
commercial redistribution. The CLA does not transfer copyright — you keep
full ownership of your work, you just grant a broad license to the project
owner.

## 3. Development setup

```bash
pnpm install
pnpm dev
```

See the [README](./README.md) for full prerequisites and the quick start.

## 4. Pull request checklist

Before hitting **Create pull request**, confirm that:

- [ ] The branch is rebased on the latest `main`.
- [ ] The test suite passes locally.
- [ ] Lint and format checks are clean.
- [ ] Commit messages are written in English, imperative mood, and scoped
      (e.g. `agent: fix llama-server restart race`).
- [ ] The PR description explains **why**, not just **what**.
- [ ] The maintainer has verified a signed agreement and authority covering this
      submission, including alternative licensing, and reviewed its provenance.
- [ ] You are OK with your change being redistributed under both AGPL and
      the commercial license (this is what signing the CLA confirms).

## 5. Reporting bugs

- Use **GitHub Issues** for reproducible bugs. Include OS, app version,
  logs path (`%LOCALAPPDATA%\FlowSight\server.log` on Windows), and steps
  to reproduce.
- Use **GitHub Security Advisories** (private) for vulnerabilities — do
  not open a public issue for security problems.

## 6. Asking for help

- General questions: GitHub Discussions (enable it when the repo goes
  public).
- Commercial / partnership inquiries: **manuel@flowsight.site**.
- Code of conduct concerns: **manuel@flowsight.site**.

---

Thank you for helping make FlowSight better.
