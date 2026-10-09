import { createContext, useContext } from "react";

export const SidebarCtx = createContext<{ open: () => void }>({ open: () => {} });
export const useSidebarCtx = () => useContext(SidebarCtx);
