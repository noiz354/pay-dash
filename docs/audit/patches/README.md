# Patches that need a permission this automation does not have

The Arena GitHub App that produces the audit remediation commits is not granted
the `workflows` permission, so GitHub refuses any push that creates or updates a
file under `.github/workflows/`:

```
! [remote rejected] (refusing to allow a GitHub App to create or update workflow
  `.github/workflows/ci.yml` without `workflows` permission)
```

Rather than drop the finding, the change is kept here as a patch.

## `ci-ordering.patch` — audit finding R-10

CI generated the Prisma Client *after* running the test suite. Two MCP suites
import `@prisma/client`, and its own postinstall does not generate the client, so
those suites failed on every single run. A permanently red suite trains reviewers
to ignore red, which is how a real failure gets merged. The patch moves
`prisma generate` ahead of `typecheck`.

Apply with either:

```sh
git apply docs/audit/patches/ci-ordering.patch
```

or grant the App the `workflows` permission and re-run the remediation, which
will then include the change as a normal commit.

This is a CI-hygiene fix only. It does not affect runtime behaviour, and it is
deliberately not bundled with the S-01 and S-03 security commits so that those
are not blocked by it.
