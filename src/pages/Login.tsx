import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import GoogleLogo from "@/components/GoogleLogo";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  sendPasswordResetOtp,
  sendVerificationOtp,
  signInWithEmailPassword,
  signInWithGoogle,
  signOutCurrentUser,
} from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase";

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTarget, setResendTarget] = useState<string | null>(null);

  const handleEmailLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setLoading(true);
      const user = await signInWithEmailPassword(email.trim(), password);

      if (!user.emailVerified) {
        await sendVerificationOtp(user);
        await signOutCurrentUser();
        setResendTarget(user.email ?? email.trim());
        toast({
          title: "OTP sent",
          description: "Please verify your email from the inbox link, then log in again.",
        });
        return;
      }

      toast({ title: "Welcome back", description: "Login successful." });
      navigate("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not log in. Please try again.";
      toast({ title: "Login failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await signInWithGoogle();
      toast({ title: "Welcome", description: "Google login successful." });
      navigate("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google sign-in failed. Please try again.";
      toast({ title: "Google login failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Enter your email first, then click forgot password.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      await sendPasswordResetOtp(email.trim());
      toast({ title: "Password reset sent", description: "Check your email for reset instructions." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not send reset email right now.";
      toast({ title: "Reset failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Enter your email and password first so we can resend verification.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const user = await signInWithEmailPassword(email.trim(), password);
      await sendVerificationOtp(user);
      await signOutCurrentUser();
      setResendTarget(user.email ?? email.trim());
      toast({ title: "OTP resent", description: "Check your inbox and spam folder." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not resend verification.";
      toast({ title: "Resend failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gradient-hero flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md border-border/70 shadow-card">
        <CardHeader>
          <CardTitle className="text-center font-heading text-2xl">Log in to OvaCare</CardTitle>
          <CardDescription className="text-center">
            Use Google or email/password. Unverified users receive OTP email link.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!isFirebaseConfigured && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4" />
                Firebase is not configured.
              </div>
              <p className="mt-1 text-xs">Add VITE_FIREBASE_* variables in Vercel and local .env file.</p>
            </div>
          )}

          {resendTarget && (
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-primary">
              Verification sent to {resendTarget}. Use the email link, then log in again.
            </div>
          )}

          <form className="space-y-3" onSubmit={handleEmailLogin}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={loading || !isFirebaseConfigured}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={loading || !isFirebaseConfigured}
              />
            </div>

            <Button
              type="submit"
              className="gradient-primary w-full border-0"
              disabled={loading || !isFirebaseConfigured}
            >
              <ArrowRight className="h-4 w-4" />
              {loading ? "Signing in..." : "Log in"}
            </Button>
          </form>

          <div className="relative pt-1 text-center text-xs text-muted-foreground">
            <span className="bg-card px-2">or continue with</span>
            <div className="absolute inset-x-0 top-1/2 -z-10 border-t" />
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => void handleGoogleLogin()}
            disabled={loading || !isFirebaseConfigured}
          >
            <GoogleLogo className="h-4 w-4" />
            Continue with Google
          </Button>
        </CardContent>

        <CardFooter className="flex-col gap-2">
          <div className="flex w-full flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleForgotPassword()}
              disabled={loading || !isFirebaseConfigured}
            >
              <KeyRound className="h-4 w-4" />
              Forgot password
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleResendVerification()}
              disabled={loading || !isFirebaseConfigured}
            >
              Resend OTP
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            New here?
            <Button variant="link" className="px-2" asChild>
              <Link to="/signup">Create an account</Link>
            </Button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Login;
