# Task Vault

Task Vault is a static HTML/CSS/JavaScript app backed by Firebase Authentication, Cloud Firestore, Cloud Storage, and Firebase Hosting. Firebase project: `task-vault1`.

## Firebase setup

1. Open the Firebase Console and select project `task-vault1`.
2. Under **Authentication → Sign-in method**, enable **Email/Password**.
3. Under **Firestore Database**, create the database in production mode.
4. Under **Storage**, create the default bucket. The app uses this bucket for task evidence.
5. In a terminal opened in this folder, install Firebase CLI if needed, then sign in:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
6. Confirm the selected project before deploying:
   ```bash
   firebase use
   ```
   `.firebaserc` selects `task-vault1` by default. The deploy command publishes the rules and static site to that project.
7. Deploy:
   ```bash
   firebase deploy
   ```
8. In **Authentication → Settings → Authorized domains**, add the domain you will use if it is not already listed.

The Firebase web configuration in `js/firebase.js` identifies the app and is safe to include in browser code. Never place service account keys or other private credentials in this folder.

## Local preview

Because the pages use JavaScript modules, serve the folder over HTTP rather than opening the HTML files directly. For example:

```bash
npx serve .
```

Then open the local URL it prints.

## Before using real employee data

Create two separate test workspaces and verify that users cannot access another company's records or evidence. The evidence bucket is private by rules, with uploads limited to 10 MB and images/PDFs. Review the rules and Firebase billing limits before launching with real users.
