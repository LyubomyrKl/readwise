'use client';

import { WifiOff, Wifi } from 'lucide-react';
import { useOffline } from '@platform/providers/OfflineProvider';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const { isOffline, wasOffline } = useOffline();

  // Show reconnected notification briefly
  if (wasOffline && !isOffline) {
    return (
      <div className="fixed bottom-4 left-4 z-50 animate-in slide-in-from-bottom-2 fade-in duration-300">
        <div className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg">
          <Wifi className="w-4 h-4" />
          <span className="text-sm font-medium">Back online</span>
        </div>
      </div>
    );
  }

  if (!isOffline) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 animate-in slide-in-from-bottom-2 fade-in duration-300">
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg',
          'bg-yellow-500 text-white'
        )}
      >
        <WifiOff className="w-4 h-4" />
        <span className="text-sm font-medium">You&apos;re offline</span>
      </div>
    </div>
  );
}
