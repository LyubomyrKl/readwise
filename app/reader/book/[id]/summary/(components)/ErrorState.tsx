import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export const ErrorState = ({error}: {error: string}) => {
  const router = useRouter();


  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md text-center p-8">
        <h2 className="text-xl font-semibold mb-4">Error</h2>
        <p className="text-muted-foreground mb-6">{error}</p>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>
      </div>
    </div>
  );
};

