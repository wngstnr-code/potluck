import { createContext, type ReactNode, useContext } from "react";
import { UNIFIED_SPEC } from "../config";
import { type HistoryState, useHistory } from "./useHistory";

const HistoryContext = createContext<HistoryState | null>(null);

/** Loads the unified history once for the whole app; every page reads the same state. */
export function HistoryProvider({ children }: { children: ReactNode }) {
  const state = useHistory(UNIFIED_SPEC);
  return <HistoryContext.Provider value={state}>{children}</HistoryContext.Provider>;
}

export function useSharedHistory(): HistoryState {
  const state = useContext(HistoryContext);
  if (!state) throw new Error("useSharedHistory outside HistoryProvider");
  return state;
}
