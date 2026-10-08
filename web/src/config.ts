/**
 * Local mode (`npm run build:local`): a single phone, no server. Data lives only
 * in this phone's IndexedDB; weather and postcode lookups go straight to the
 * public APIs; there is no login and no Web Push.
 */
export const LOCAL = import.meta.env.VITE_LOCAL === '1';
