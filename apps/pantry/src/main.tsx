import "@potluck/theme/fonts.css";
import "@potluck/theme/tokens.css";
import "@potluck/ui/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { HistoryProvider } from "./lib/HistoryContext";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
  <StrictMode>
    <HistoryProvider>
      <App />
    </HistoryProvider>
  </StrictMode>,
);
