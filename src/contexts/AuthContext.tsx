import { createContext, useContext } from 'react';

interface AuthContextValue {
  setProfileComplete: (complete: boolean) => void;
}

export const AuthContext = createContext<AuthContextValue>({
  setProfileComplete: () => {},
});

export function useAuthContext() {
  return useContext(AuthContext);
}
