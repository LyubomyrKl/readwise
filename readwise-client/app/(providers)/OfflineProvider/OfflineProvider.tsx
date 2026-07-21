'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

interface OfflineContextType {
  isOffline: boolean;
  wasOffline: boolean;
}

const OfflineContext = createContext<OfflineContextType>({
  isOffline: false,
  wasOffline: false,
});

interface OfflineProviderProps {
  children: ReactNode;
}

export function OfflineProvider({ children }: OfflineProviderProps) {
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  const handleOnline = useCallback(() => {
    if (isOffline) {
      setWasOffline(true);
    }
    setIsOffline(false);
  }, [isOffline]);

  const handleOffline = useCallback(() => {
    setIsOffline(true);
  }, []);

  useEffect(() => {
    // Set initial state
    setIsOffline(!navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  // Clear wasOffline flag after a delay
  useEffect(() => {
    if (wasOffline) {
      const timer = setTimeout(() => {
        setWasOffline(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [wasOffline]);

  return (
    <OfflineContext.Provider value={{ isOffline, wasOffline }}>
      {children}
    </OfflineContext.Provider>
  );
}

export const useOffline = () => useContext(OfflineContext);
