# upwell

## 0.1.1

### Patch Changes

- 77f8fc0: The UI kit's default light and dark themes are now monochrome (black, white and greys), matching
  the Upwell design system. Set `colors.primary` with `UpwellThemeProvider` to use your brand color.

## 0.1.0

### Minor Changes

- c7dbf4d: First release: a pure, table-tested decision engine (`decide()` / `explain()`), policy and
  `releases.json` schemas with runtime validation, Android Play in-app updates (flexible and
  immediate, progress, `completeUpdate`, resume of interrupted immediate updates, install source),
  iOS App Store sheet and lookup, an expo-updates adapter with stranded-runtime detection,
  `UpwellProvider` / `useAppUpdate` / `useUpdateHistory`, a themeable UI kit, simulation mode
  (Play `FakeAppUpdateManager` on Android) and a config plugin.
