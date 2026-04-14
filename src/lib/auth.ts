import {
  User,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { getFirebaseAuth, googleProvider } from "@/lib/firebase";

const getActionCodeSettings = () => ({
  url: import.meta.env.VITE_AUTH_REDIRECT_URL || `${window.location.origin}/login`,
  handleCodeInApp: false,
});

export const signUpWithEmailPassword = async (
  email: string,
  password: string,
  displayName?: string,
) => {
  const auth = getFirebaseAuth();
  const { user } = await createUserWithEmailAndPassword(auth, email, password);

  if (displayName?.trim()) {
    await updateProfile(user, { displayName: displayName.trim() });
  }

  return user;
};

export const signInWithEmailPassword = async (email: string, password: string) => {
  const auth = getFirebaseAuth();
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  return user;
};

export const signInWithGoogle = async () => {
  const auth = getFirebaseAuth();
  const { user } = await signInWithPopup(auth, googleProvider);
  return user;
};

export const sendVerificationOtp = async (user: User) => {
  await sendEmailVerification(user, getActionCodeSettings());
};

export const sendPasswordResetOtp = async (email: string) => {
  const auth = getFirebaseAuth();
  await sendPasswordResetEmail(auth, email, getActionCodeSettings());
};

export const signOutCurrentUser = async () => {
  const auth = getFirebaseAuth();
  await signOut(auth);
};
