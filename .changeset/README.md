# Changesets

Every PR that touches `packages/*` needs a changeset: run `npx changeset` and commit the generated file.
While the packages are `0.x`, never use a `major` bump: it would jump straight to `1.0.0`, which is a
deliberate decision of the maintainer. Use `minor` for breaking changes (and say so in the text).
Versioning and publishing are handled by the maintainer, never from a feature branch.
