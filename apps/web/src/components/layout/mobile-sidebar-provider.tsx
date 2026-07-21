'use client';

import { createContext, useContext, useState, useCallback } from 'react';

interface MobileSidebarContextValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const MobileSidebarContext = createContext<MobileSidebarContextValue>({
  open: false,
  toggle: () => {},
  close: () => {},
});

export function useMobileSidebar() {
  return useContext(MobileSidebarContext);
}

export function MobileSidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <MobileSidebarContext.Provider value={{ open, toggle, close }}>
      {children}
    </MobileSidebarContext.Provider>
  );
}
