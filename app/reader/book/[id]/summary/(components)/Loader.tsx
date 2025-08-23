import React from 'react';
import { Loader2 } from 'lucide-react';

export const Loader = () => {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span>Loading book...</span>
      </div>
    </div>
  );
};

