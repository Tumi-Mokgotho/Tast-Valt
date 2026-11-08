# Employee management setup

The Employees page supports deactivation, reactivation, and permanent employee-account deletion.

## 1. Configure the server-side Firebase Admin credential

Permanent deletion must run on the server because the Firebase client SDK cannot delete another person's Authentication account.

1. Open Firebase Console for the `task-vault1` project.
2. Go to **Project settings → Service accounts**.
3. Generate a new private key and download the JSON file.
4. In Vercel, open the Task Vault project and go to **Settings → Environment Variables**.
5. Add `FIREBASE_SERVICE_ACCOUNT_JSON` and paste the complete JSON file contents as its value.
6. Enable it for Production (and Preview too, if you test preview deployments).
7. Save and redeploy the project.

**Never commit the service-account JSON file, paste it into frontend JavaScript, or share it in chat.** This credential has administrator access to the Firebase project. Keep it only in Vercel's encrypted environment variables.

The Vercel API endpoint verifies the signed-in manager's Firebase ID token and checks that the target is an employee in that manager's company before deleting anything.

## 2. Deploy the Firestore security rules

After this branch is merged and pulled locally, run:

```bash
firebase deploy --only firestore:rules
```

The updated rules ensure inactive employees cannot read or update their assigned tasks or access company data. Managers can still see inactive employee profiles and reactivate them.

## 3. Verify the employee controls

- Deactivate an employee: their status becomes `inactive`; their account and task history remain.
- Reactivate an employee: their status returns to `active` and their assigned tasks become accessible again.
- Permanently delete an employee: the Firebase Authentication account and Firestore profile are removed. Existing assigned tasks are retained, unassigned, and given an audit activity entry.

Permanent deletion requires the `FIREBASE_SERVICE_ACCOUNT_JSON` Vercel variable. Without it, the API deliberately refuses to run.
