"use client";

import React from "react";
import { motion } from "framer-motion";
import { BookOpen, Sparkles, Brain, FileText } from "lucide-react";

const steps = [
  { icon: BookOpen, label: "Reading content", active: true },
  { icon: Brain, label: "Analyzing structure", active: true },
  { icon: Sparkles, label: "Generating insights", active: true },
  { icon: FileText, label: "Creating summary", active: false },
];

export const Processing = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="max-w-md w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          {/* Animated Icon */}
          <motion.div
            className="relative w-28 h-28 mx-auto mb-8"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-primary/5" />
            <motion.div
              className="absolute inset-2 rounded-full bg-gradient-to-br from-primary/20 to-transparent"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              >
                <Brain className="w-10 h-10 text-primary" />
              </motion.div>
            </div>
            {/* Orbiting dots */}
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute w-3 h-3 rounded-full bg-primary"
                style={{
                  top: "50%",
                  left: "50%",
                  marginTop: -6,
                  marginLeft: -6,
                }}
                animate={{
                  x: [0, Math.cos((i * 2 * Math.PI) / 3) * 50],
                  y: [0, Math.sin((i * 2 * Math.PI) / 3) * 50],
                  opacity: [0.3, 1, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.3,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.div>

          <h2 className="text-2xl font-bold mb-3">Creating Your Summary</h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Our AI is analyzing the book and generating a comprehensive summary
            tailored for you.
          </p>

          {/* Processing Steps */}
          <div className="space-y-3 text-left mb-8">
            {steps.map((step, index) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.2 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"
              >
                <div
                  className={`p-2 rounded-lg ${
                    step.active
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <step.icon className="w-4 h-4" />
                </div>
                <span
                  className={
                    step.active ? "text-foreground" : "text-muted-foreground"
                  }
                >
                  {step.label}
                </span>
                {step.active && (
                  <motion.div
                    className="ml-auto flex gap-1"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/30" />
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>

          <div className="text-sm text-muted-foreground">
            This usually takes 2-3 minutes. Feel free to wait or come back
            later.
          </div>
        </motion.div>
      </div>
    </div>
  );
};
