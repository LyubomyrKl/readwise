"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft, AlertCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export const ErrorState = ({ error }: { error: string }) => {
  const router = useRouter();

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.1 }}
          className="w-20 h-20 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center"
        >
          <AlertCircle className="w-10 h-10 text-destructive" />
        </motion.div>

        <h2 className="text-2xl font-bold mb-3">Something went wrong</h2>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          {error || "We couldn't load the summary. Please try again."}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button variant="outline" onClick={() => router.back()} className="w-full sm:w-auto">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          <Button onClick={handleRetry} className="w-full sm:w-auto">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      </motion.div>
    </div>
  );
};
