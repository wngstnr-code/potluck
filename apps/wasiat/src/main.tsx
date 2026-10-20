import "@potluck/theme/fonts.css";
import "@potluck/theme/tokens.css";
import "@potluck/ui/styles.css";
import "./wasiat.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { RecoveryProvider } from "./lib/RecoveryContext";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
  <StrictMode>
    <RecoveryProvider>
      <App />
    </RecoveryProvider>
  </StrictMode>,
);
