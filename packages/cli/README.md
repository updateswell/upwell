# @upwell/cli

The command line for [Upwell](https://upwell.run): validate and edit `policy.json` and
`releases.json`, and see what a device on any build would be told, using the same engine as the
app.

```sh
npx @upwell/cli policy validate
npx @upwell/cli policy set latest --platform android --version 3.4.0 --build 340
npx @upwell/cli releases add --from-eas-update eas-update.json --kind fix
npx @upwell/cli explain --platform android --build 330 --runtime 3.3.0
```

Every command takes `--json` and prints `{ "ok": true, "data": … }` or
`{ "ok": false, "error": { "code": "…", "message": "…" } }`. Without a terminal (or with `CI`
set) it never prompts.

Docs: [docs.upwell.run/docs/reference/cli](https://docs.upwell.run/docs/reference/cli)

## License

MIT
