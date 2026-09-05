import React from "react";
import { createRoot } from "react-dom/client";
// Global base styles first, so a component's CSS Module can override a shared
// primitive (`.panel`, `.status-*`) at equal specificity.
import "./styles/global.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
