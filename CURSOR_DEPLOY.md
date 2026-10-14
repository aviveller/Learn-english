# Deploy instructions (for Cursor)

Static site, no build step. Firebase project: `learn-english-1910a` (already set in .firebaserc).
Config is already filled in `public/firebase-config.js`. Anonymous Auth and Firestore are already enabled in the console.

Steps:
1. `npm install -g firebase-tools` (skip if installed)
2. `firebase login`
3. From this folder: `firebase deploy --only hosting,firestore:rules`
4. Expected result: Hosting URL https://learn-english-1910a.web.app

Do not add a build step, bundler, or package.json — `public/` is served as-is
(React 18 UMD + Babel standalone + Firebase compat SDK from CDNs).
