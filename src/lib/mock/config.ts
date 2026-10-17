/**
 * Mock-mode configuration.
 *
 * `VITE_USE_MOCK=true` swaps the REST client and Socket.IO client for in-browser
 * stand-ins seeded with demo data, so the chat can be exercised without the
 * backend running. See `.env.development`.
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

/**
 * When false, the dummy chat never auto-replies (useful for quiet testing).
 * Always off against the real backend.
 */
export const MOCK_AUTO_REPLY = USE_MOCK && import.meta.env.VITE_MOCK_AUTO_REPLY !== 'false'

/**
 * Mirrors the backend's `EMAIL_VERIFICATION_ENABLED`. When true, registering
 * creates an unverified account (no session) and login returns 403 until
 * verified — the mock prints the verification link to the browser console and
 * exposes it to the UI so the flow is demoable. Always off against the real
 * backend (which enforces verification itself).
 */
export const MOCK_EMAIL_VERIFICATION =
  USE_MOCK && import.meta.env.VITE_MOCK_EMAIL_VERIFICATION === 'true'
