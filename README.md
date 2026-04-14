
# OvaCare Frontend

Tech stack:

- React 18 + TypeScript 5
- Vite 5
- Tailwind CSS + shadcn/ui
- React Router DOM
- TanStack Query
- Firebase Auth (Google + email/password)

## Run locally

```bash
npm install
npm run dev
```

## Firebase auth setup

1. Create a Firebase project in the Firebase Console.
2. Go to Build -> Authentication -> Sign-in method.
3. Enable these providers:
	- Google
	- Email/Password
4. In Project settings -> General -> Your apps, create a Web app and copy config values.
5. Create a local `.env` file from `.env.example` and fill all keys:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_AUTH_REDIRECT_URL=https://your-domain.com/login
```

## Vercel environment variables

In Vercel project settings -> Environment Variables, add the same `VITE_*` variables from `.env`.

After adding vars, redeploy.

## Authorized domains and redirect URLs

In Firebase Authentication settings:

1. Add your Vercel domain (for example `your-app.vercel.app`) to Authorized domains.
2. Add your custom domain too if used.
3. Set `VITE_AUTH_REDIRECT_URL` to your login page URL.

## Auth flow implemented

- `Sign up` page supports Google and email/password.
- New email/password users get a verification email link (used as OTP-like verification step).
- `Login` page blocks unverified email accounts and resends verification link.
- `Forgot password` sends reset email.

## Important OTP note

Firebase Auth does not provide native numeric OTP for email/password sign-in.

- Current implementation uses email verification link (one-time verification flow).
- If you need numeric email OTP (6-digit code), add a backend function (Firebase Functions or your own API) to generate and validate OTP codes.

## Build

```bash
npm run build
```
