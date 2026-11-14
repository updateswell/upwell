<a href="https://upwell.run">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://upwell.run/brand/banner-dark.png">
    <img src="https://upwell.run/brand/banner-light.png" alt="Upwell: no user left on an old build. Update orchestrator for React Native and Expo.">
  </picture>
</a>

**No user left on an old build.** Upwell decides, on every launch and foreground, what kind
of update a React Native / Expo user needs (OTA, flexible or required store update, stranded
runtime) and drives it end to end. It works with no configuration; a small remote policy adds
forced updates and stranded-install detection.

```sh
npx expo install upwell
```

📖 **Documentation: [docs.upwell.run](https://docs.upwell.run)** · SDK readme:
[`packages/upwell`](packages/upwell/README.md)

## This repository

| Path                                 | What                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| [`packages/upwell`](packages/upwell) | The SDK: JavaScript, Android and iOS module, config plugin, JSON Schemas → npm `upwell` |
| [`example`](example)                 | Expo example app that runs the SDK from source                                          |
| [`apps/docs`](apps/docs)             | Docs site ([docs.upwell.run](https://docs.upwell.run))                                  |
| [`docs`](docs)                       | Recipes, example policy files and plans                                                 |

## Development

```sh
npm install          # installs the workspace
npm test             # Jest
npm run lint         # ESLint, zero warnings
npm run typecheck    # tsc
npm run build        # packages/*/build
```

Every change to a published package needs a changeset (`npx changeset`).

## License

[MIT](LICENSE)
