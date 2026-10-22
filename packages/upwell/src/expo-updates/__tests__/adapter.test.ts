const mockUpdates: Record<string, unknown> = {};
const mockConstants: { expoConfig: { runtimeVersion?: unknown } | null } = { expoConfig: null };
const updates = mockUpdates;
const constants = mockConstants;

// An ES-module proxy, so the namespace import sees later changes to mockUpdates.
jest.mock(
  'expo-updates',
  () =>
    new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : mockUpdates[key as string]) })
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return mockConstants;
  },
}));

// eslint-disable-next-line import/first
import { expoUpdatesAdapter } from '../index';

beforeEach(() => {
  for (const k of Object.keys(updates)) delete updates[k];
  constants.expoConfig = null;
});

describe('expoUpdatesAdapter()', () => {
  it('reports the update id and the EAS group id', () => {
    Object.assign(updates, {
      runtimeVersion: '3.4.0',
      updateId: 'abc',
      isEmbeddedLaunch: false,
      manifest: { metadata: { updateGroup: 'group-1' } },
    });
    expect(expoUpdatesAdapter().getRuntime()).toEqual({
      runtimeVersion: '3.4.0',
      updateId: 'abc',
      updateIds: ['abc', 'group-1'],
      isEmbedded: false,
    });
  });

  it('falls back to the configured runtime when expo-updates reports an empty one (debug builds)', () => {
    Object.assign(updates, { runtimeVersion: '', updateId: null, manifest: {} });
    constants.expoConfig = { runtimeVersion: '3.3.0' };
    expect(expoUpdatesAdapter().getRuntime().runtimeVersion).toBe('3.3.0');
    constants.expoConfig = { runtimeVersion: { policy: 'appVersion' } };
    expect(expoUpdatesAdapter().getRuntime().runtimeVersion).toBeNull();
  });

  it('is disabled when expo-updates is off', async () => {
    Object.assign(updates, { isEnabled: false });
    await expect(expoUpdatesAdapter().check()).resolves.toMatchObject({
      available: false,
      disabled: true,
    });
  });

  it('checks, downloads and reloads through expo-updates', async () => {
    const checkForUpdateAsync = jest.fn(async () => ({ isAvailable: true }));
    const fetchUpdateAsync = jest.fn(async () => ({ isNew: true }));
    const reloadAsync = jest.fn(async () => {});
    Object.assign(updates, { isEnabled: true, checkForUpdateAsync, fetchUpdateAsync, reloadAsync });
    const adapter = expoUpdatesAdapter({ checkInDev: true });
    await expect(adapter.check()).resolves.toEqual({ available: true });
    await adapter.download();
    await adapter.apply();
    expect(fetchUpdateAsync).toHaveBeenCalled();
    expect(reloadAsync).toHaveBeenCalled();
  });

  it('skips checks in development unless asked', async () => {
    Object.assign(updates, { isEnabled: true, checkForUpdateAsync: jest.fn() });
    await expect(expoUpdatesAdapter().check()).resolves.toMatchObject({
      disabled: true,
      reason: 'development build',
    });
  });
});
