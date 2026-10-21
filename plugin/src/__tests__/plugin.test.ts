import { AndroidConfig, type ExpoConfig } from 'expo/config-plugins';

import withUpwell, { validateProps } from '../index';

type Mods = { mods?: Record<string, Record<string, (c: unknown) => Promise<unknown>>> };

async function runMod(config: ExpoConfig, platform: string, mod: string, modResults: unknown) {
  const fn = (config as ExpoConfig & Mods).mods?.[platform]?.[mod];
  if (!fn) throw new Error(`no ${platform}.${mod} mod`);
  const result = (await fn({
    ...config,
    modResults,
    modRequest: {
      platform,
      modName: mod,
      projectRoot: '/tmp',
      platformProjectRoot: '/tmp',
      introspect: true,
    },
  })) as { modResults: unknown };
  return result.modResults;
}

const base = (): ExpoConfig => ({ name: 'x', slug: 'x' });

describe('config plugin', () => {
  it('validates options', () => {
    expect(validateProps(undefined)).toEqual({});
    expect(() => validateProps({ nope: 1 })).toThrow('unknown plugin option "nope"');
    expect(() => validateProps({ playAppUpdateVersion: 'latest' })).toThrow('must look like');
    expect(() => validateProps({ storeUrlQueries: 'yes' })).toThrow('must be a boolean');
  });

  it('sets the Play Core version in gradle.properties', async () => {
    const config = withUpwell(base(), { playAppUpdateVersion: '2.1.0' });
    const props = (await runMod(config, 'android', 'gradleProperties', [
      { type: 'property', key: 'upwellPlayAppUpdateVersion', value: '1.0.0' },
    ])) as { key: string; value: string }[];
    expect(props).toEqual([
      { type: 'property', key: 'upwellPlayAppUpdateVersion', value: '2.1.0' },
    ]);
  });

  it('adds a market:// query on Android once', async () => {
    const config = withUpwell(base());
    const manifest = {
      manifest: { $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' } },
    };
    const once = (await runMod(
      config,
      'android',
      'manifest',
      manifest
    )) as AndroidConfig.Manifest.AndroidManifest;
    const twice = (await runMod(config, 'android', 'manifest', once)) as {
      manifest: { queries: unknown[] };
    };
    expect(twice.manifest.queries).toHaveLength(1);
    expect(JSON.stringify(twice)).toContain('"android:scheme":"market"');
  });

  it('adds App Store schemes on iOS', async () => {
    const config = withUpwell(base());
    const plist = (await runMod(config, 'ios', 'infoPlist', {
      LSApplicationQueriesSchemes: ['foo'],
    })) as Record<string, string[]>;
    expect(plist.LSApplicationQueriesSchemes).toEqual(['foo', 'itms-apps', 'itms-beta']);
  });

  it('can skip the store queries', () => {
    const config = withUpwell(base(), { storeUrlQueries: false }) as ExpoConfig & Mods;
    expect(config.mods?.ios?.infoPlist).toBeUndefined();
  });
});
