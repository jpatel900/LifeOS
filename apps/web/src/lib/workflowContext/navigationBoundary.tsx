"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

type NavigationLatch = { redirected: boolean; sessionConfirmed: boolean };
type NavigationState = {
  routes: Map<string, NavigationLatch>;
  observe: () => void;
};
const NavigationContext = createContext<NavigationState | null>(null);

function RouteObserver({ routes }: { routes: NavigationState["routes"] }) {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === null) return;
    for (const route of routes.keys()) {
      if (route !== pathname) routes.delete(route);
    }
  }, [pathname, routes]);
  return null;
}

// Navigation requests belong to the mounted route, not an account reducer.
// Keep only these two booleans across account remounts, never workflow data.
export function WorkflowNavigationBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const routes = useRef(new Map<string, NavigationLatch>()).current;
  const [observing, setObserving] = useState(false);
  const observe = useCallback(() => setObserving(true), []);
  const value = useMemo(() => ({ routes, observe }), [routes, observe]);
  return (
    <NavigationContext.Provider value={value}>
      {observing ? <RouteObserver routes={routes} /> : null}
      {children}
    </NavigationContext.Provider>
  );
}

export function useWorkflowNavigationLatch(pathname: string) {
  const boundary = useContext(NavigationContext);
  const fallback = useRef<NavigationLatch>({
    redirected: false,
    sessionConfirmed: false,
  });
  const latch = useMemo(() => {
    if (!boundary) return fallback.current;
    let current = boundary.routes.get(pathname);
    if (!current) {
      current = { redirected: false, sessionConfirmed: false };
      boundary.routes.set(pathname, current);
    }
    return current;
  }, [boundary, pathname]);
  useEffect(() => boundary?.observe(), [boundary]);
  return latch;
}
