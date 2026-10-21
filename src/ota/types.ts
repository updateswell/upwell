export interface OtaRuntime {
  runtimeVersion: string | null;
  /** Id of the running update; null for the embedded bundle when the tool doesn't expose one. */
  updateId: string | null;
  /** Every id the running update is known by (update id, group id), for `releases.json` matching. */
  updateIds?: string[];
  isEmbedded?: boolean;
}

export interface OtaCheckResult {
  available: boolean;
  /** True when OTA is off here (dev build, not configured). */
  disabled?: boolean;
  reason?: string;
}

/** Bridges an OTA tool (expo-updates, …) to Upwell. */
export interface OtaAdapter {
  readonly name: string;
  getRuntime(): OtaRuntime;
  check(): Promise<OtaCheckResult>;
  download(): Promise<void>;
  /** Restarts into the downloaded update. Usually never resolves on a real device. */
  apply(): Promise<void>;
}
