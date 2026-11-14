// Read at runtime rather than copied into the source, so the version changesets writes into
// package.json is always the one reported. build/ sits next to src/, so the path works for both.
const pkg = require('../package.json') as { version: string };

/** Version of the `upwell` package, reported in every event. */
export const SDK_VERSION: string = pkg.version;
