/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the real backend, e.g. https://api.nurture.app. Empty means same origin. */
  readonly VITE_API_URL?: string
  /** Set to "false" to turn off the in-browser mock backend. */
  readonly VITE_USE_MOCKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
