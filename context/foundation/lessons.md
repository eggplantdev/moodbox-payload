# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Reinstall native modules on the machine that runs them

- **Context**: Any native/binary npm dep with per-platform optional packages (sharp, esbuild, unrs-resolver) on Apple Silicon; after cloning, copying node_modules from CI/Docker, or installing under Rosetta.
- **Problem**: pnpm materializes only the optional binary matching the install-time platform. An x64/Rosetta install leaves only `@img/sharp-darwin-x64`, so an arm64 runtime throws "Could not load the sharp module using the darwin-arm64 runtime" even though the lockfile lists both arches.
- **Rule**: When a native module fails to load with an arch mismatch, verify node's `process.arch` vs the installed binaries and run `pnpm install --force` on the target machine. Never copy node_modules across architectures. Do not edit the lockfile — it already lists all arches.
- **Applies to**: implement, impl-review
