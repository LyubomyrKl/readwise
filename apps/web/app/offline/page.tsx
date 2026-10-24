'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6">
          <WifiOff className="w-8 h-8 text-muted-foreground" />
        </div>

        <h1 className="text-2xl font-bold mb-2">You&apos;re Offline</h1>

        <p className="text-muted-foreground mb-6">
          It looks like you&apos;ve lost your internet connection.
          Check your network settings and try again.
        </p>

        <Button onClick={handleRetry} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Retry Connection
        </Button>

        <p className="text-sm text-muted-foreground mt-8">
          Some features may still be available offline.
          Your progress will sync when you reconnect.
        </p>
      </div>
    </div>
  );
}
