import React from 'react';
import { Clock, Loader2 } from 'lucide-react';

export const Processing = () => {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
        </div>
        <h2 className="text-2xl font-bold mb-4">Processing Summary</h2>
        <p className="text-muted-foreground mb-4 leading-relaxed">
          AI is analyzing the book content and generating your personalized summary. This usually takes 2-3 minutes.
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>Please wait while we process...</span>
        </div>
      </div>
    </div>
  );
};

