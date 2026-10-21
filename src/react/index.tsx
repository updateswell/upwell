import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';

import {
  createUpwell,
  type UpwellController,
  type UpwellOptions,
  type UpwellState,
} from '../controller';
import type { Decision, Release, StoreFlow } from '../core/types';
import type { SimulationOptions, SimulationScenario } from '../simulation';

const UpwellContext = createContext<UpwellController | null>(null);

export type UpwellProviderProps = (
  | ({ controller: UpwellController } & Partial<UpwellOptions>)
  | ({ controller?: undefined } & UpwellOptions)
) & {
  /** Check when the provider mounts. Default true. */
  checkOnMount?: boolean;
  /** Check when the app returns to the foreground (throttled by `minCheckIntervalMs`). Default true. */
  checkOnForeground?: boolean;
  children?: ReactNode;
};

/** Owns an UpwellController and runs launch and foreground checks. */
export function UpwellProvider({
  controller: given,
  checkOnMount = true,
  checkOnForeground = true,
  children,
  ...options
}: UpwellProviderProps) {
  // Options are read once; pass a controller to change them later.
  const [controller] = useState(() => given ?? createUpwell(options as UpwellOptions));

  useEffect(() => {
    if (checkOnMount) void controller.check({ force: true });
  }, [controller, checkOnMount]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && !checkOnForeground) return;
      controller.handleAppStateChange(next);
    });
    return () => sub.remove();
  }, [controller, checkOnForeground]);

  return <UpwellContext.Provider value={controller}>{children}</UpwellContext.Provider>;
}

/** The controller from the nearest `<UpwellProvider>`. */
export function useUpwell(): UpwellController {
  const controller = useContext(UpwellContext);
  if (!controller) throw new Error('useUpwell() must be used inside <UpwellProvider>');
  return controller;
}

/** The full controller state; re-renders on every change. */
export function useUpwellState(): UpwellState {
  const c = useUpwell();
  return useSyncExternalStore(c.subscribe, c.getState, c.getState);
}

export interface AppUpdate {
  decision: Decision;
  state: UpwellState;
  /** Download progress 0–1 while a store update downloads, else null. */
  progress: number | null;
  isChecking: boolean;
  /** A blocking update is needed. */
  isRequired: boolean;
  /** The user dismissed the current prompt this session. */
  isDismissed: boolean;
  isBusy: boolean;
  check(): Promise<Decision>;
  /** Does what the current decision calls for (store flow, install, OTA restart). */
  startUpdate(): Promise<unknown>;
  startStoreUpdate(flow?: StoreFlow): Promise<unknown>;
  completeStoreUpdate(): Promise<void>;
  applyOta(): Promise<void>;
  /** Opens the store page directly. */
  openStore(): Promise<unknown>;
  dismiss(): void;
  /** Lines explaining the current decision. */
  explain(): string[];
  simulate(scenario: SimulationScenario | null, options?: SimulationOptions): Promise<Decision>;
}

/** What kind of update this user needs, and the actions to drive it. */
export function useAppUpdate(): AppUpdate {
  const c = useUpwell();
  const state = useUpwellState();
  const actions = useMemo(
    () => ({
      check: () => c.check({ force: true }),
      startUpdate: () => c.startUpdate(),
      startStoreUpdate: (flow?: StoreFlow) => c.startStoreUpdate(flow),
      completeStoreUpdate: () => c.completeStoreUpdate(),
      applyOta: () => c.applyOta(),
      openStore: () => c.startStoreUpdate('storeLink'),
      dismiss: () => c.dismiss(),
      explain: () => c.explain().trace,
      simulate: (scenario: SimulationScenario | null, options?: SimulationOptions) =>
        c.simulate(scenario, options),
    }),
    [c]
  );
  const d = state.decision;
  return {
    decision: d,
    state,
    progress: d.kind === 'store.downloading' ? d.progress : null,
    isChecking: state.status === 'checking',
    isRequired: d.kind === 'store.required' || (d.kind === 'store.downloading' && d.required),
    isDismissed: state.dismissed,
    isBusy: state.busy,
    ...actions,
  };
}

export interface UpdateHistory {
  /** releases.json entry of the running OTA update. */
  current: Release | null;
  /** Releases for this runtime, newest first. */
  history: Release[];
  /** The update that was just applied, until `markSeen()`. */
  justUpdated: Release | null;
  markSeen(): void;
}

/** OTA release notes for "What's new" and the "Updated" sheet. */
export function useUpdateHistory(): UpdateHistory {
  const c = useUpwell();
  const state = useUpwellState();
  const markSeen = useMemo(() => () => c.markUpdateSeen(), [c]);
  return {
    current: state.currentRelease,
    history: state.history,
    justUpdated: state.justUpdated,
    markSeen,
  };
}

export type { UpwellController, UpwellOptions, UpwellState };
