/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIFF_ID?: string;
  readonly VITE_LINE_LOGIN_CHANNEL_ID?: string;
  readonly VITE_OMISE_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
