import { createContext, useContext } from "react";

export interface ChasingContextValue {
  skippedIds: ReadonlySet<string>;
  setSkippedIds: (
    set: ReadonlySet<string> | ((prev: ReadonlySet<string>) => ReadonlySet<string>),
  ) => void;
}

export const ChasingContext = createContext<ChasingContextValue | undefined>(undefined);

export function useChasingContext(): ChasingContextValue {
  const context = useContext(ChasingContext);
  if (!context) {
    throw new Error("useChasingContext must be used within ChasingLayout");
  }
  return context;
}
