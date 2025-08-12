"use client";

import { useTransition, useState } from "react";
import { motion } from "framer-motion";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  UserPlus,
  Shield,
  ArrowLeft,
} from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormField,
  FormItem,
  FormControl,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { ROUTES } from "@/app/(consts)/pages";
import { useRouter } from "next/navigation";
import { useMotion } from "@/app/(providers)/MotionProvider/MotionProvider";

const RegisterSchema = z
  .object({
    name: z.string().min(2, "Min 2 characters").max(64, "Max 64 characters"),
    email: z.email("Invalid email"),
    password: z.string().min(8, "Min 8 characters"),
    confirm: z.string().min(8, "Min 8 characters"),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Passwords do not match",
  });

type RegisterValues = z.infer<typeof RegisterSchema>;

export default function Register() {
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { enabled } = useMotion();

  const form = useForm<RegisterValues>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { name: "", email: "", password: "", confirm: "" },
    mode: "onTouched",
  });

  async function onSubmit(values: RegisterValues) {
    setServerError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!r.ok) {
        const msg = await safeMsg(r);
        setServerError(msg || "Sign in failed");
        return;
      }

      router.replace(ROUTES.home);
    } catch (e) {
      setServerError("Network error");
    }
  }

  const Wrapper: any = enabled ? motion.div : "div";

  return (
    <div className="mx-auto grid min-h-svh w-full max-w-[1120px] place-items-center px-4">
      <Wrapper
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-[480px]"
      >
        <Card className="border-0 bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60 shadow-lg ring-1 ring-border/60">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span className="text-xs tracking-wide">Create your account</span>
            </div>
            <CardTitle className="text-2xl">Register</CardTitle>
            <CardDescription>
              Join to access your library and workbench
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <FormControl>
                          <Input
                            placeholder="Your name"
                            type="text"
                            autoComplete="name"
                            className="pl-10"
                            {...field}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <FormControl>
                          <Input
                            placeholder="you@example.com"
                            type="email"
                            autoComplete="email"
                            className="pl-10"
                            {...field}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <FormControl>
                          <Input
                            type={showPwd ? "text" : "password"}
                            autoComplete="new-password"
                            placeholder="••••••••"
                            className="pl-10 pr-10"
                            {...field}
                          />
                        </FormControl>
                        <button
                          type="button"
                          onClick={() => setShowPwd((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:bg-muted/50"
                          aria-label={
                            showPwd ? "Hide password" : "Show password"
                          }
                        >
                          {showPwd ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm password</FormLabel>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <FormControl>
                          <Input
                            type={showConfirm ? "text" : "password"}
                            autoComplete="new-password"
                            placeholder="••••••••"
                            className="pl-10 pr-10"
                            {...field}
                          />
                        </FormControl>
                        <button
                          type="button"
                          onClick={() => setShowConfirm((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:bg-muted/50"
                          aria-label={
                            showConfirm ? "Hide password" : "Show password"
                          }
                        >
                          {showConfirm ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {serverError ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {serverError}
                  </div>
                ) : null}

                <Button
                  type="submit"
                  disabled={isPending}
                  className="group w-full"
                  size="lg"
                >
                  <UserPlus className="mr-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  {isPending ? "Creating account..." : "Create account"}
                </Button>
              </form>
            </Form>

            <Separator className="my-6" />

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <Link
                className="hover:text-foreground inline-flex items-center gap-1"
                href={ROUTES.auth.login}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </Link>
              <Link className="hover:text-foreground" href="/privacy">
                Privacy Policy
              </Link>
            </div>
          </CardContent>

          <CardFooter className="justify-center">
            <div className="text-xs text-muted-foreground">
              By creating an account you agree to our{" "}
              <Link
                className="underline underline-offset-4 hover:text-foreground"
                href="/terms"
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                className="underline underline-offset-4 hover:text-foreground"
                href="/privacy"
              >
                Privacy Policy
              </Link>
              .
            </div>
          </CardFooter>
        </Card>
      </Wrapper>
    </div>
  );
}

async function safeMsg(r: Response) {
  try {
    const data = await r.json();
    return data?.message || data?.error;
  } catch {
    return null;
  }
}
