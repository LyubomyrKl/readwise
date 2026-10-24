"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ServiceWorkerRegistration() {
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  const handleUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      setShowUpdateNotification(false);
      window.location.reload();
    }
  }, [waitingWorker]);

  const dismissUpdate = useCallback(() => {
    setShowUpdateNotification(false);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("SW registered:", registration.scope);

          // Check for updates periodically
          const checkForUpdates = () => {
            registration.update().catch(console.error);
          };

          // Check for updates every 5 minutes
          const interval = setInterval(checkForUpdates, 5 * 60 * 1000);

          // Handle update found
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New version available
                  setWaitingWorker(newWorker);
                  setShowUpdateNotification(true);
                }
              });
            }
          });

          // Check if there's already a waiting worker
          if (registration.waiting) {
            setWaitingWorker(registration.waiting);
            setShowUpdateNotification(true);
          }

          return () => clearInterval(interval);
        })
        .catch((error) => {
          console.log("SW registration failed:", error);
        });

      // Handle controller change (reload when new SW takes over)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }, []);

  if (!showUpdateNotification) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-2 fade-in duration-300">
      <div className="flex items-center gap-3 bg-primary text-primary-foreground px-4 py-3 rounded-lg shadow-lg max-w-sm">
        <div className="flex-1">
          <p className="text-sm font-medium">Update available</p>
          <p className="text-xs opacity-90">Refresh to get the latest version</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleUpdate}
          className="gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          Update
        </Button>
        <button
          onClick={dismissUpdate}
          className="p-1 hover:bg-primary-foreground/10 rounded"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
