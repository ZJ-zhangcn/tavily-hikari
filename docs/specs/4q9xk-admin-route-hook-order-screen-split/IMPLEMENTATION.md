# Implementation

## Current State

- `AdminDashboardRuntime.tsx` now keeps the shared admin shell state in the parent path and dispatches route-specific content through screen components.
- `web/src/admin/screens/UsersUsageScreen.tsx` and `web/src/admin/screens/UnboundTokenUsageScreen.tsx` hold the page-specific route bodies.
- `web/src/admin/screens/shared.tsx` contains shared table / intro helpers used by both screens.
- `web/src/admin/AdminDashboardRuntime.route-switch.test.tsx` provides the local red-capable route-switch loop for the white-screen regression.
- `web/test/happydom.ts` now registers a stable local URL so history navigation in the route-switch test works deterministically.

## Verification

- `cd web && bun test src/admin/AdminDashboardRuntime.route-switch.test.tsx`
- `cd web && bun test src/admin/AdminPages.stories.test.ts`
- `cd web && bun run build`

## Pending

- Live Chrome confirmation on the production site.
- Storybook / browser visual evidence capture for the new screen contract.
- Full spec sync once the remaining evidence artifacts are committed.
