import { QueryClient } from '@tanstack/react-query';

// "Cache until changed": data shows instantly from cache on every revisit and is
// only refetched when a mutation invalidates it or the user pull-to-refreshes.
// No background refetch on mount/focus/reconnect.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: 1000 * 60 * 60, // 1h
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});
