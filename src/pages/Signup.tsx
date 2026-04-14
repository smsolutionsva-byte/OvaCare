import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, Mail, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { sendVerificationOtp, signInWithGoogle, signOutCurrentUser, signUpWithEmailPassword } from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase";

const Signup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Confirm password must match the original password.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const user = await signUpWithEmailPassword(email.trim(), password, fullName.trim());
      await sendVerificationOtp(user);
      await signOutCurrentUser();

      toast({
        title: "OTP sent",
        description: "Check your email for the verification link before logging in.",
      });

      navigate("/login");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create account. Please try again.";
      toast({ title: "Sign-up failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    try {
      setLoading(true);
      await signInWithGoogle();
      toast({ title: "Signed in with Google", description: "Your account is ready." });
      navigate("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google sign-in failed. Please try again.";
      toast({ title: "Google sign-up failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gradient-hero flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md border-border/70 shadow-card">
        <CardHeader>
          <CardTitle className="text-center font-heading text-2xl">Create your account</CardTitle>
          <CardDescription className="text-center">
            Sign up with Google or email/password and verify using email OTP link.
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

          <Button
            variant="outline"
            className="w-full"
            onClick={() => void handleGoogleSignup()}
            disabled={loading || !isFirebaseConfigured}
          >
            Continue with Google
          </Button>

          <div className="relative text-center text-xs text-muted-foreground">
            <span className="bg-card px-2">or create with email</span>
            <div className="absolute inset-x-0 top-1/2 -z-10 border-t" />
          </div>

          <form className="space-y-3" onSubmit={handleEmailSignup}>
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                placeholder="e.g. Jane Doe"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                disabled={loading || !isFirebaseConfigured}
              />
            </div>

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
                placeholder="At least 6 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={loading || !isFirebaseConfigured}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                disabled={loading || !isFirebaseConfigured}
              />
            </div>

            <Button
              type="submit"
              className="gradient-primary w-full border-0"
              disabled={loading || !isFirebaseConfigured}
            >
              <UserPlus className="h-4 w-4" />
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center text-sm text-muted-foreground">
          Already have an account?
          <Button variant="link" className="px-2" asChild>
            <Link to="/login">
              <Mail className="h-4 w-4" />
              Log in
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Signup;
