/** Saloni pilota Scaramuzzo (allineato Print Bridge). */
export const BRIDGE_SALON_IDS = [1, 2, 3, 4] as const;

export type BridgeSalonId = (typeof BRIDGE_SALON_IDS)[number];

/** Bridge considerato offline in dashboard se last_seen oltre questa soglia. */
export const BRIDGE_OFFLINE_THRESHOLD_MINUTES = 2;

/** Warning processing jobs da heartbeat (minuti). */
export const BRIDGE_PROCESSING_WARN_MINUTES = 5;

/** Warning job pending in coda da heartbeat (minuti). */
export const BRIDGE_QUEUED_WARN_MINUTES = 5;

/** Heartbeat history mostrati in dashboard per installazione. */
export const BRIDGE_HEARTBEAT_HISTORY_LIMIT = 20;

export const BRIDGE_TOKEN_PREFIX = "scz_br_";
