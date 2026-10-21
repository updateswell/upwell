export * from './core';
export { UpwellController, createUpwell, type UpwellOptions, type UpwellState } from './controller';
export type { OtaAdapter, OtaCheckResult, OtaRuntime } from './ota/types';
export {
  jsonUrl,
  staticSource,
  type JsonUrlOptions,
  type PolicySource,
  type ReleasesSource,
  type Source,
} from './sources';
export type {
  BaseInstalledInfo,
  KeyValueStorage,
  StoreFlowContext,
  StoreFlowResult,
  StoreProgress,
  UpwellPlatform,
} from './platform/types';
export { createNativePlatform, openStoreUrl } from './platform/nativePlatform';
export { createMemoryStorage } from './platform/memoryStorage';
export {
  lookupAppStore,
  appStoreLookupUrl,
  type AppStoreLookupOptions,
} from './platform/appStoreLookup';
export {
  createSimulation,
  SimulatedPlatform,
  SimulatedOta,
  SIMULATION_SCENARIOS,
  type SimulationScenario,
  type SimulationOptions,
  type SimulationSetup,
} from './simulation';
export {
  getUpwellNative,
  type NativeInstalledInfo,
  type PlaySimulationConfig,
  type PlayStartResult,
  type PlayInstallStateEvent,
} from './native/UpwellNative';
