
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

## AI intake copilot setup (Groq or OpenRouter)

This project includes a secure server endpoint at `/api/ai-intake`.
API keys are server-side only. Do not add them as `VITE_*` variables.

Add one or both providers in Vercel env vars:

```env
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile

OPENROUTER_API_KEY=...
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct
OPENROUTER_SITE_URL=https://your-domain.com
OPENROUTER_APP_NAME=OvaCare
```

After adding AI env vars, redeploy. On the Risk Predictor results page, users can type additional symptoms and generate:

- Structured intake summary
- Red-flag checks
- Follow-up doctor questions
- 30-day plan
- Current vs projected risk chart

## Report Tracker (Firebase-backed timeline)

Report Tracker stores each logged blood report under the signed-in user's account in Firestore.
Snapshots are created from the Report Analyzer page after OCR extraction (Tracker is trends-only).

Collection path used:

```text
users/{uid}/labReports/{reportId}
```

Each snapshot stores:

- `testDate` (YYYY-MM-DD)
- `reportTitle`
- `source` (`ocr`)
- `markers[]` (name, value, unit, ref range, status)
- `createdAt`

### Firestore setup

1. In Firebase Console, open Build -> Firestore Database.
2. Create database in production mode (recommended) or test mode (temporary).
3. Add security rules so users can only access their own report timeline:

```txt
rules_version = '2';
service cloud.firestore {
	match /databases/{database}/documents {
		match /users/{userId}/labReports/{reportId} {
			allow read, write: if request.auth != null && request.auth.uid == userId;
		}
	}
}
```

4. Deploy rules.

No additional environment variables are required beyond existing `VITE_FIREBASE_*` values.

## Product and standards references used

- HL7 FHIR Observation (clinical measurement modeling): https://www.hl7.org/fhir/observation.html
- CDC Diabetes Testing (example threshold framing and follow-up context): https://www.cdc.gov/diabetes/diabetes-testing/index.html
- WHO Cardiovascular Diseases topic (risk factor context): https://www.who.int/health-topics/cardiovascular-diseases
- Carbon Design System Data Visualization (dashboard storytelling patterns): https://carbondesignsystem.com/data-visualization/dashboards/

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
