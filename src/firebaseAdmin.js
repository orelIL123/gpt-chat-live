/**
 * /src/firebaseAdmin.js
 *
 * Initializes Firebase Admin SDK using a service‐account JSON
 * and exports the `admin` object for Firestore, Auth, Storage, etc.
 */

import admin from "firebase-admin";
import path from "path";

// Path to your service account JSON
const serviceAccountPath = path.resolve(
  __dirname,
  "../firebase/gpt-chat-saas-firebase-adminsdk-fbsvc-3349ec3cd2.json"
);

const serviceAccount = await import(serviceAccountPath, {
  assert: { type: "json" },
});

// Initialize only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount.default || serviceAccount),
    // replace <PROJECT_ID> with your actual project ID if you want databaseURL:
    // databaseURL: "https://<PROJECT_ID>.firebaseio.com"
  });
}

export default admin;