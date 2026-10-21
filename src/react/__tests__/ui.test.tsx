import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { UpwellController } from '../../controller';
import { policy } from '../../core/__tests__/fixtures';
import type { ReleasesDocument, StoreInfo } from '../../core/types';
import type { OtaAdapter } from '../../ota/types';
import type { BaseInstalledInfo } from '../../platform/types';
import { SimulatedPlatform } from '../../simulation';
import { staticSource } from '../../sources';
import { UpwellThemeProvider, UpwellUI, WhatsNew } from '../../ui';
import { UpwellProvider, useAppUpdate, useUpdateHistory } from '../index';

function installed(over: Partial<BaseInstalledInfo> = {}): BaseInstalledInfo {
  return {
    platform: 'android',
    appId: 'com.example.app',
    nativeVersion: '3.3.0',
    buildNumber: '330',
    installSource: 'play',
    installationId: 'install-a',
    osVersion: '15',
    ...over,
  };
}

const play: StoreInfo = {
  kind: 'play',
  updateAvailability: 'available',
  availableVersionCode: 340,
  updatePriority: 0,
  stalenessDays: 5,
  immediateAllowed: true,
  flexibleAllowed: true,
  installStatus: 'unknown',
  bytesDownloaded: 0,
  totalBytesToDownload: 0,
};

const releases: ReleasesDocument = {
  schemaVersion: 1,
  releases: [
    {
      id: 'u-2',
      platforms: ['android'],
      runtimeVersion: '3.3.0',
      kind: 'fix',
      notes: 'Fixed login',
      publishedAt: '2026-10-21T00:00:00Z',
    },
    {
      id: 'u-1',
      platforms: ['android'],
      runtimeVersion: '3.3.0',
      kind: 'content',
      notes: 'New banner',
      publishedAt: '2026-10-20T00:00:00Z',
    },
  ],
};

function ota(updateId: string): OtaAdapter {
  return {
    name: 'fake',
    getRuntime: () => ({ runtimeVersion: '3.3.0', updateId, updateIds: [updateId] }),
    check: async () => ({ available: false }),
    download: async () => {},
    apply: async () => {},
  };
}

function setup(
  over: {
    installed?: Partial<BaseInstalledInfo>;
    store?: StoreInfo | null;
    ota?: OtaAdapter;
    lastSeen?: string;
    noMessage?: boolean;
  } = {}
) {
  const platform = new SimulatedPlatform(
    'android',
    {
      installed: installed(over.installed),
      store: over.store === undefined ? { ...play } : over.store,
    },
    1,
    true
  );
  if (over.lastSeen) platform.storage.set('lastSeenUpdateId', over.lastSeen);
  const p = over.noMessage ? policy({ android: { message: undefined } }) : policy();
  return new UpwellController({
    policy: staticSource(p),
    releases: staticSource(releases),
    platform,
    ota: over.ota,
  });
}

async function settle(ms = 50) {
  await act(() => new Promise((r) => setTimeout(r, ms)));
}

async function until(fn: () => boolean, timeout = 2000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('timed out');
    await settle(10);
  }
}

describe('<UpwellProvider> + hooks', () => {
  it('useAppUpdate() throws outside the provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useAppUpdate())).rejects.toThrow('inside <UpwellProvider>');
  });

  it('checks on mount and exposes the decision', async () => {
    const controller = setup();
    const { result } = await renderHook(() => useAppUpdate(), {
      wrapper: ({ children }) => (
        <UpwellProvider controller={controller}>{children}</UpwellProvider>
      ),
    });
    await until(() => result.current.decision.kind === 'store.recommended');
    expect(result.current.isRequired).toBe(false);
    expect(result.current.explain().length).toBeGreaterThan(0);
  });

  it('builds a controller from options', async () => {
    const platform = new SimulatedPlatform(
      'android',
      { installed: installed(), store: { ...play } },
      1,
      true
    );
    const { result } = await renderHook(() => useAppUpdate(), {
      wrapper: ({ children }) => (
        <UpwellProvider policy={staticSource(policy())} platform={platform}>
          {children}
        </UpwellProvider>
      ),
    });
    await until(() => result.current.decision.kind === 'store.recommended');
  });

  it('useUpdateHistory() lists the runtime history', async () => {
    const controller = setup({ ota: ota('u-1') });
    const { result } = await renderHook(() => useUpdateHistory(), {
      wrapper: ({ children }) => (
        <UpwellProvider controller={controller}>{children}</UpwellProvider>
      ),
    });
    await until(() => result.current.history.length === 2);
    expect(result.current.current?.id).toBe('u-1');
    expect(result.current.justUpdated).toBeNull();
  });
});

describe('UI kit', () => {
  function App({ controller }: { controller: UpwellController }) {
    return (
      <UpwellProvider controller={controller}>
        <Text>app</Text>
        <UpwellUI />
      </UpwellProvider>
    );
  }

  it('prompt → Later snoozes it', async () => {
    const controller = setup();
    await render(<App controller={controller} />);
    await until(() => !!screen.queryByTestId('upwell-update-prompt'));
    expect(screen.getByText('Update available')).toBeTruthy();
    expect(screen.getByText('Grab the latest version.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('upwell-prompt-later'));
    await settle();
    expect(screen.queryByTestId('upwell-update-prompt')).toBeNull();
    expect(controller.getState().decision.kind).toBe('upToDate');
  });

  it('prompt → Update → progress banner → restart snackbar → installed', async () => {
    const controller = setup();
    await render(<App controller={controller} />);
    await until(() => !!screen.queryByTestId('upwell-update-prompt'));
    await fireEvent.press(screen.getByTestId('upwell-prompt-update'));
    await until(
      () =>
        !!screen.queryByTestId('upwell-download-banner') ||
        !!screen.queryByTestId('upwell-restart-snackbar')
    );
    await until(() => !!screen.queryByTestId('upwell-restart-snackbar'));
    expect(screen.getByText('Update downloaded. Restart to install it.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('upwell-restart'));
    await until(() => controller.getState().installed?.buildNumber === '340');
    expect(screen.queryByTestId('upwell-restart-snackbar')).toBeNull();
  });

  it('shows download progress', async () => {
    const controller = setup({
      store: {
        ...play,
        installStatus: 'downloading',
        bytesDownloaded: 30,
        totalBytesToDownload: 100,
      },
    });
    await render(<App controller={controller} />);
    await until(() => !!screen.queryByTestId('upwell-download-banner'));
    expect(screen.getByText('Downloading update… 30%')).toBeTruthy();
    expect(screen.getByTestId('upwell-download-progress').props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 30,
    });
  });

  it('uses the policy message on the blocking screen', async () => {
    const controller = setup({ installed: { buildNumber: '290' } });
    await render(<App controller={controller} />);
    await until(() => !!screen.queryByTestId('upwell-force-update'));
    expect(screen.getByText('Grab the latest version.')).toBeTruthy();
  });

  it('blocks the app for a required update', async () => {
    const controller = setup({ installed: { buildNumber: '290' }, noMessage: true });
    await render(<App controller={controller} />);
    await until(() => !!screen.queryByTestId('upwell-force-update'));
    expect(screen.getByText('Update required')).toBeTruthy();
    const start = jest.spyOn(controller, 'startUpdate');
    await fireEvent.press(screen.getByTestId('upwell-force-update-button'));
    expect(start).toHaveBeenCalled();
  });

  it('shows the Updated sheet once after an OTA update', async () => {
    const controller = setup({ ota: ota('u-2'), lastSeen: 'u-1' });
    await render(<App controller={controller} />);
    await until(() => !!screen.queryByTestId('upwell-updated-sheet'));
    expect(screen.getByText('Fixed login')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('upwell-updated-dismiss'));
    await settle();
    expect(screen.queryByTestId('upwell-updated-sheet')).toBeNull();
  });

  it('<WhatsNew /> lists releases with kind badges', async () => {
    const controller = setup({ ota: ota('u-1') });
    await render(
      <UpwellProvider controller={controller}>
        <WhatsNew />
      </UpwellProvider>
    );
    await until(() => !!screen.queryByText('Fixed login'));
    expect(screen.getByText('New banner')).toBeTruthy();
    expect(screen.getByText('Fix')).toBeTruthy();
    expect(screen.getByText('Content')).toBeTruthy();
  });

  it('is themeable, including copy', async () => {
    const controller = setup({ installed: { buildNumber: '290' }, noMessage: true });
    await render(
      <UpwellThemeProvider
        theme={{ strings: { requiredTitle: 'Bitte aktualisieren' } }}
        scheme="dark">
        <App controller={controller} />
      </UpwellThemeProvider>
    );
    await until(() => !!screen.queryByText('Bitte aktualisieren'));
  });
});
