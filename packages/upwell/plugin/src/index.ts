import {
  type ConfigPlugin,
  createRunOncePlugin,
  withAndroidManifest,
  withGradleProperties,
  withInfoPlist,
} from 'expo/config-plugins';

export interface UpwellPluginProps {
  /** Play Core `app-update` version. Default 2.1.0. */
  playAppUpdateVersion?: string;
  /**
   * Declares the App Store / Play Store URL schemes so `Linking.canOpenURL()` works for them.
   * Upwell itself doesn't need this. Default true.
   */
  storeUrlQueries?: boolean;
}

const pkg = { name: 'upwell', version: '0.0.1' };
try {
  Object.assign(pkg, require('../../package.json'));
} catch {
  // Fine when bundled elsewhere.
}

const GRADLE_KEY = 'upwellPlayAppUpdateVersion';

export function validateProps(props: unknown): UpwellPluginProps {
  if (props == null) return {};
  if (typeof props !== 'object') throw new Error('[upwell] plugin options must be an object');
  const p = props as Record<string, unknown>;
  for (const key of Object.keys(p)) {
    if (key !== 'playAppUpdateVersion' && key !== 'storeUrlQueries') {
      throw new Error(`[upwell] unknown plugin option "${key}"`);
    }
  }
  if (
    p.playAppUpdateVersion !== undefined &&
    !/^\d+\.\d+\.\d+$/.test(String(p.playAppUpdateVersion))
  ) {
    throw new Error('[upwell] playAppUpdateVersion must look like "2.1.0"');
  }
  if (p.storeUrlQueries !== undefined && typeof p.storeUrlQueries !== 'boolean') {
    throw new Error('[upwell] storeUrlQueries must be a boolean');
  }
  return p as UpwellPluginProps;
}

const withPlayVersion: ConfigPlugin<string | undefined> = (config, version) =>
  withGradleProperties(config, (c) => {
    c.modResults = c.modResults.filter(
      (item) => !(item.type === 'property' && item.key === GRADLE_KEY)
    );
    if (version) c.modResults.push({ type: 'property', key: GRADLE_KEY, value: version });
    return c;
  });

type Intent = {
  action?: { $: { 'android:name': string } }[];
  data?: { $: Record<string, string> }[];
};

const withMarketQuery: ConfigPlugin = (config) =>
  withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest as typeof c.modResults.manifest & {
      queries?: { intent?: Intent[] }[];
    };
    manifest.queries = manifest.queries ?? [];
    const exists = manifest.queries.some((q) =>
      q.intent?.some((i) => i.data?.some((d) => d.$['android:scheme'] === 'market'))
    );
    if (!exists) {
      manifest.queries.push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            data: [{ $: { 'android:scheme': 'market' } }],
          },
        ],
      });
    }
    return c;
  });

const withStoreSchemes: ConfigPlugin = (config) =>
  withInfoPlist(config, (c) => {
    const schemes = new Set<string>(
      (c.modResults.LSApplicationQueriesSchemes as string[] | undefined) ?? []
    );
    schemes.add('itms-apps');
    schemes.add('itms-beta');
    c.modResults.LSApplicationQueriesSchemes = [...schemes];
    return c;
  });

const withUpwell: ConfigPlugin<UpwellPluginProps | void> = (config, rawProps) => {
  const props = validateProps(rawProps);
  config = withPlayVersion(config, props.playAppUpdateVersion);
  if (props.storeUrlQueries !== false) {
    config = withMarketQuery(config);
    config = withStoreSchemes(config);
  }
  return config;
};

export default createRunOncePlugin(withUpwell, pkg.name, pkg.version);
