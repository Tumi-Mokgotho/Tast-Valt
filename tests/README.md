# Firestore security rules tests

These tests use the local Firestore Emulator and a demo project ID. They do not connect to or change the live Firebase project.

## Run the tests

Requirements: Node.js 24 or newer and Java 21 or newer.

From the repository root:

```bash
npm install --prefix tests
npx firebase-tools@15.30.2 emulators:exec --project demo-task-vault-rules --only firestore "npm --prefix tests test"
```

The emulator loads the repository's `firestore.rules` file through `firebase.json`.

The suite checks manager access, employee-only task queries, team-list restrictions, invitation creation, invitation acceptance, wrong-email rejection, and company isolation.

**Important:** passing these tests does not replace testing the complete website with separate manager and employee accounts. It also does not deploy rules to Firebase.
