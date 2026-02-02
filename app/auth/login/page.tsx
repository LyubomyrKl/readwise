"use client";

import { useTransition, useState } from "react";
import { motion } from "framer-motion";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  Shield,
  ArrowRight,
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
import { ROUTES } from "@/app/(consts)/routes";
import { useRouter } from "next/navigation";
import { useMotion } from "@/app/(providers)/MotionProvider/MotionProvider";
import { apiFetch } from "@/lib/fetcher";

const LoginSchema = z.object({
  email: z.email("Invalid email"),
  password: z.string().min(8, "Min 8 characters"),
});
type LoginValues = z.infer<typeof LoginSchema>;

export default function Login() {
  const [showPwd, setShowPwd] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { enabled } = useMotion();

  const form = useForm<LoginValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onTouched",
  });

  async function onSubmit(values: LoginValues) {
    setServerError(null);
    try {
      const r = await apiFetch("POST", "/api/auth/login", values);
      if (!r) {
        setServerError("Invalid credentials");
        return;
      }

      router.replace(ROUTES.home); // or router.push
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Network error";
      setServerError(errorMessage);
    }
  }

  const Wrapper: any = enabled ? motion.div : "div";

  return (
    <div className="mx-auto grid min-h-svh w-full max-w-[1120px] place-items-center px-3 sm:px-4">
      <Wrapper
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-[420px] px-1 sm:px-0"
      >
        <Card className="border-0 bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60 shadow-lg ring-1 ring-border/60">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span className="text-xs tracking-wide">Secure area</span>
            </div>
            <CardTitle className="text-xl sm:text-2xl">Sign in</CardTitle>
            <CardDescription>Access your library and workbench</CardDescription>
          </CardHeader>

          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
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
                            autoComplete="current-password"
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
                  <LogIn className="mr-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  {isPending ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </Form>

            <Separator className="my-6" />

            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-0 text-sm text-muted-foreground">
              <Link
                className="hover:text-foreground"
                href={ROUTES.auth.register}
              >
                Create account
              </Link>
              <Link className="hover:text-foreground" href="/forgot-password">
                Forgot password?
              </Link>
            </div>
          </CardContent>

          <CardFooter className="justify-center">
            <div className="text-xs text-muted-foreground">
              By continuing you agree to our{" "}
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

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          className="mx-auto mt-6 flex max-w-[420px] items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <span>No account yet?</span>
          <Link
            href={ROUTES.auth.register}
            className="inline-flex items-center gap-1 text-foreground hover:underline"
          >
            Register <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </motion.div>
      </Wrapper>
    </div>
  );
}
