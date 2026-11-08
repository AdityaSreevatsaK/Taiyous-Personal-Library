/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HF_DATASET_REPO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
