import admin from 'firebase-admin';

// Initialize Firebase Admin SDK ONLY ONCE
try {
  if (!admin.apps.length) {
    const serviceAccountEnvVar = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountEnvVar) {
      throw new Error('Firebase Service Account JSON was not found in environment variable FIREBASE_SERVICE_ACCOUNT.');
    }
    // Parse the JSON string from the environment variable
    const serviceAccount = JSON.parse(serviceAccountEnvVar);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin Initialized successfully from firebaseAdmin.js");
  } else {
    console.log("Firebase Admin already initialized.");
  }
} catch (error) {
  console.error('Firebase Admin Initialization Error in firebaseAdmin.js:', error);
  // Optionally re-throw or handle critical failure
}

// Export the initialized Firestore instance (and admin if needed elsewhere)
const db = admin.firestore();

export { admin, db }; 