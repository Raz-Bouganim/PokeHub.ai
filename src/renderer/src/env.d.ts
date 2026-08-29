/// <reference types="vite/client" />

import type { PokeHubBridge } from "../../shared/ipc.ts";

declare global {
  interface Window {
    pokehub: PokeHubBridge;
  }
}
