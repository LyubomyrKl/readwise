"use client";

import { motion, Variants } from "framer-motion";
import { useLearningSettings } from "@/hooks/useLearning";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Brain, ArrowLeft, Loader2 } from "lucide-react";
import { useMotion } from "../../(providers)/MotionProvider/MotionProvider";
import Link from "next/link";
import { ROUTES } from "@/app/(consts)/routes";

const container: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export default function LearningSettingsPage() {
  const { enabled } = useMotion();
  const { settings, isLoading, updateSettings } = useLearningSettings();

  const Wrapper: React.ElementType = enabled ? motion.div : "div";

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleToggle = async (key: keyof typeof settings, value: boolean) => {
    await updateSettings({ [key]: value });
  };

  const handleSlider = async (key: keyof typeof settings, value: number) => {
    await updateSettings({ [key]: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={ROUTES.settings.root}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6" />
          Learning Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Customize your learning experience
        </p>
      </div>

      <Wrapper
        {...(enabled
          ? {
              variants: container,
              initial: "hidden",
              whileInView: "show",
              viewport: { once: true, margin: "-10%" },
            }
          : {})}
        className="space-y-4"
      >
        {/* Card Generation */}
        <Card>
          <CardHeader>
            <CardTitle>Card Generation</CardTitle>
            <CardDescription>
              Choose which card types to generate from your notes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="recognition">Recognition Cards</Label>
                <p className="text-sm text-muted-foreground">
                  L2 sentence → understand meaning
                </p>
              </div>
              <Switch
                id="recognition"
                checked={settings.generateRecognition}
                onCheckedChange={(v) => handleToggle("generateRecognition", v)}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="production">Production Cards</Label>
                <p className="text-sm text-muted-foreground">
                  L1 meaning → produce L2 sentence (most important)
                </p>
              </div>
              <Switch
                id="production"
                checked={settings.generateProduction}
                onCheckedChange={(v) => handleToggle("generateProduction", v)}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="cloze">Cloze Cards</Label>
                <p className="text-sm text-muted-foreground">
                  Fill in the missing word
                </p>
              </div>
              <Switch
                id="cloze"
                checked={settings.generateCloze}
                onCheckedChange={(v) => handleToggle("generateCloze", v)}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="grammar">Grammar Cards</Label>
                <p className="text-sm text-muted-foreground">
                  Conjugation and declension practice
                </p>
              </div>
              <Switch
                id="grammar"
                checked={settings.generateGrammar}
                onCheckedChange={(v) => handleToggle("generateGrammar", v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Daily Limits */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Limits</CardTitle>
            <CardDescription>
              Control your daily study load
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>New Cards Per Day</Label>
                <span className="font-medium">{settings.newCardsPerDay}</span>
              </div>
              <Slider
                value={[settings.newCardsPerDay]}
                onValueChange={([v]) => handleSlider("newCardsPerDay", v)}
                min={5}
                max={50}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                How many new cards to introduce each day
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Max Reviews Per Day</Label>
                <span className="font-medium">{settings.maxReviewsPerDay}</span>
              </div>
              <Slider
                value={[settings.maxReviewsPerDay]}
                onValueChange={([v]) => handleSlider("maxReviewsPerDay", v)}
                min={50}
                max={500}
                step={25}
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of reviews per session
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Study Options */}
        <Card>
          <CardHeader>
            <CardTitle>Study Options</CardTitle>
            <CardDescription>
              Customize the study experience
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="showTime">Show Response Time</Label>
                <p className="text-sm text-muted-foreground">
                  Display timer while reviewing cards
                </p>
              </div>
              <Switch
                id="showTime"
                checked={settings.showResponseTime}
                onCheckedChange={(v) => handleToggle("showResponseTime", v)}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="enforceProduction">Enforce Production</Label>
                <p className="text-sm text-muted-foreground">
                  Prioritize production cards when imbalance detected
                </p>
              </div>
              <Switch
                id="enforceProduction"
                checked={settings.enforceProduction}
                onCheckedChange={(v) => handleToggle("enforceProduction", v)}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="requireTyping">Require Typing</Label>
                <p className="text-sm text-muted-foreground">
                  Type answers instead of revealing (harder)
                </p>
              </div>
              <Switch
                id="requireTyping"
                checked={settings.requireTyping}
                onCheckedChange={(v) => handleToggle("requireTyping", v)}
              />
            </div>
          </CardContent>
        </Card>
      </Wrapper>
    </div>
  );
}
