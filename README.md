# ci-templates

Reusable GitHub Actions workflows shared across [Leon Lourenço](https://github.com/leon-lourenco)'s
portfolio repos — one place to fix a CI/CD bug or add a capability instead of copy-pasting
YAML across every repo and letting them drift.

Three workflows, each callable independently via `workflow_call`:

| Workflow | What it does |
|---|---|
| [`gradle-build-test.yml`](.github/workflows/gradle-build-test.yml) | `./gradlew build` on a JDK you choose — compiles every module, runs every test, uploads coverage reports as a build artifact. |
| [`codeql-java.yml`](.github/workflows/codeql-java.yml) | Static analysis (CodeQL) over Java/Kotlin source, results land in the calling repo's Security tab. |
| [`pages-jacoco.yml`](.github/workflows/pages-jacoco.yml) | Builds the project, collects every module's JaCoCo HTML report into one static site (one subfolder per module, with an index), and deploys it to GitHub Pages. |

## Using these from another repo

```yaml
# .github/workflows/ci.yml in the calling repo
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  security-events: write
  pages: write
  id-token: write

jobs:
  build-test:
    uses: leon-lourenco/ci-templates/.github/workflows/gradle-build-test.yml@main
    with:
      java-version: '26'

  codeql:
    uses: leon-lourenco/ci-templates/.github/workflows/codeql-java.yml@main
    with:
      java-version: '26'

  pages:
    needs: build-test
    if: github.ref == 'refs/heads/master' && github.event_name == 'push'
    uses: leon-lourenco/ci-templates/.github/workflows/pages-jacoco.yml@main
    with:
      java-version: '26'
```

Each calling repo still needs its own `.github/dependabot.yml` — Dependabot configuration isn't
a workflow, so it can't be centralized the same way; see any repo using these templates for a
copy-pasteable example.

## Why reusable workflows instead of a composite action

A [reusable workflow](https://docs.github.com/en/actions/sharing-automations/reusing-workflows)
can define multiple jobs, its own `permissions`, and its own `concurrency` group — a composite
action can't do any of that, it's limited to a single job's steps. Every workflow here needs at
least one of those (CodeQL needs `security-events: write`, Pages needs its own concurrency
group), so reusable workflows are the right primitive, not composite actions.

## License

MIT — see [LICENSE](LICENSE).
