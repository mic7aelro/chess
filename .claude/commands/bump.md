Create a new version branch using semantic versioning. Usage: /bump patch | minor | major

1. Run `git branch --show-current` to get the current branch name
2. Parse the version from the branch name (expects format `vX.Y.Z`)
3. If the branch name doesn't match that format, stop and warn me
4. Based on the argument given:
   - `patch` → increment Z (e.g. `v0.1.0` → `v0.1.1`)
   - `minor` → increment Y, reset Z to 0 (e.g. `v0.1.0` → `v0.2.0`)
   - `major` → increment X, reset Y and Z to 0 (e.g. `v0.1.0` → `v1.0.0`)
5. If no argument is given, default to `minor`
6. Create and switch to the new branch: `git checkout -b vX.Y.Z`
7. Confirm the new branch name to me
