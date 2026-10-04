# OvaCare

OvaCare is a web app for exploring PCOS-related symptoms, tracking reports, and preparing questions for a healthcare professional. The symptom score is calculated by rules in [`src/lib/riskCalculator.ts`](src/lib/riskCalculator.ts); it is not a diagnosis.

**[Try the live app](https://ova-care-ten.vercel.app/)**

## What you can explore

- Answer a symptom questionnaire and see the factors behind the resulting score.
- Review lab reports and keep a report history.
- Use the care copilot and clinic search features when their server-side services are configured.
- Sign in and save data when Firebase is configured.

## How it is built

The frontend uses **React, TypeScript, Vite, Tailwind CSS, and React Router**. Firebase provides authentication and data storage. TypeScript functions in [`api/`](api/) provide the server-side endpoints used by the AI and clinic features when deployed on Vercel.

## Run the frontend locally

You need Node.js and npm.

```bash
git clone https://github.com/smsolutionsva-byte/OvaCare.git
cd OvaCare
npm install
npm run dev
```

Open **http://localhost:8080**. The symptom questionnaire and local scoring logic can run in the Vite frontend. Features that call `/api/*` need the server-side functions running as well; `npm run dev` alone does not serve them.

To enable Firebase, copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` values. Vite exposes variables prefixed with `VITE_` to the browser, so do not put private credentials in them. Keep `GROQ_API_KEY` and `OPENROUTER_API_KEY` in the server environment for the API functions.

## Check the project

```bash
npm test
npm run build
```

## Author

Shivansh Mukhia · [GitHub](https://github.com/smsolutionsva-byte) · [Email](mailto:sm.solutions.va@gmail.com)
