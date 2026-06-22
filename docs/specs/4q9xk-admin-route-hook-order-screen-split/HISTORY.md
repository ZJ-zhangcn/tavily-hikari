# History

## 2026-06-22

- Created the focused spec after reproducing the `/admin/users/usage` white screen and confirming the root cause was route-specific early returns before later hooks in `AdminDashboardRuntime.tsx`.
- Extracted the `user-usage` and `unbound-token-usage` route bodies into screen components and added a route-switch regression test to lock the hook-order fix.
- Aligned the story proof surface to the same screen contract so Storybook no longer needs a separate copy of the production route JSX.
