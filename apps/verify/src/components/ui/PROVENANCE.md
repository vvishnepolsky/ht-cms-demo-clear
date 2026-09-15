# Civic Design System — Vendor Provenance

This directory contains components vendored from the Civic design system using the
shadcn model: **the app owns these copies**. Do not edit files here and expect
changes to survive a re-vendor. Track intentional local modifications in the
"Local divergences" section below and re-apply them after each bump.

## Source

| Field         | Value                                    |
| ------------- | ---------------------------------------- |
| Repository    | https://github.com/isapp/civic           |
| Source path   | packages/ui/src                          |
| Pinned SHA    | 1943b5858645bf36e6802d3700964424338a9d60 |
| Vendor date   | 2026-06-22                               |
| Component set | select radio-group checkbox              |

## Exclusions

Files matching `*.figma.tsx` and `*.test.tsx` are never vendored.

## Bump Procedure

1. Resolve a new SHA:
   git ls-remote https://github.com/isapp/civic.git main

2. Re-run the vendor script (overwrites files in place):
   scripts/vendor-civic.sh apps/templates/ee/resident <new-40-hex-sha> [component...]

3. Review upstream changes:
   git diff apps/templates/ee/resident/src/components/ui/ apps/templates/ee/resident/src/styles/civic-globals.css

4. Reconcile local divergences listed below — re-apply patches and update
   the "Local divergences" section to reflect the reconciled state.

## Local divergences

- `switch.tsx` (ENG-2556) — added locally, NOT produced by `vendor-civic.sh`. Ported
  from the shadcn-style Switch vendored in `apps/iowa/align-resident/src/app/components/ui/switch.tsx`
  (`@radix-ui/react-switch`). Three intentional edits vs. the Iowa source: (1) the `cn`
  import points at `@/components/lib/utils` (ee-resident has no co-located `ui/utils.ts`);
  (2) the unchecked track uses `bg-input` instead of `bg-switch-background` because
  ee-resident's `civic-globals.css` defines no `--color-switch-background` token; and
  (3) the Iowa `dark:` variant classes (`dark:data-[state=unchecked]:bg-input/80` on the
  track, `dark:` thumb overrides) were dropped — ee-resident ships no dark-mode theme block
  and uses no `dark:` classes elsewhere. Re-check all three (especially the dark-mode
  question) against Civic's own `switch` if/when it enters the vendor component set.

## Dependency note

Vendored components' transitive npm runtime deps
(@base-ui/react, lucide-react, class-variance-authority, clsx, tailwind-merge,
@radix-ui/colors, @fontsource-variable/geist) are governed by the normal
dependency-scanning path — this file is NOT the complete third-party inventory.
