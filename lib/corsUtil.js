import admin from 'firebase-admin';

// Initialize Firebase Admin SDK if not already initialized
// This needs to be done only once, typically at the application startup.
// Ensure your service account key is configured via environment variables
// or another secure method.
if (!admin.apps.length) {
  // Check if running in a Vercel environment (adjust as needed)
  if (process.env.VERCEL) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\n/g, '\n') // Handle escaped newlines
      })
    });
  } else {
     // Local development or other environments might use GOOGLE_APPLICATION_CREDENTIALS
     admin.initializeApp();
  }
}


export async function applyDynamicCors(req, res, clientId) {
  const origin = req.headers.origin;

  // Allow localhost for development convenience
  if (process.env.NODE_ENV !== 'production' && origin === 'http://localhost:3000') {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return true;
  }


  if (!origin) {
      console.warn(`CORS check failed for client ${clientId}: No origin header.`);
      // Don't send 403 here, might be a non-browser request or server-to-server
      // Let subsequent logic handle it if origin is strictly required.
      // Returning false indicates CORS headers were *not* set for a specific origin.
      return false; // No specific origin to check against allowed list
  }

  if (!clientId) {
      console.error('CORS check failed: clientId is missing.');
      res.status(400).json({ message: 'Client ID is required' }); // Bad request if clientId is missing
      return false;
  }

  try {
    const docRef = admin.firestore().collection('brains').doc(clientId);
    const doc = await docRef.get();

    const allowedOrigins = doc.exists ? doc.data().allowedOrigins || [] : [];

    if (Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      console.log(`CORS check passed for client ${clientId}, origin: ${origin}`);
      return true; // Origin is allowed
    } else {
      console.warn(`CORS check failed for client ${clientId}. Origin "${origin}" not in allowed list: [${allowedOrigins.join(', ')}]`);
      res.status(403).json({ message: 'Origin not allowed' });
      return false; // Origin is not allowed
    }
  } catch (error) {
      console.error(`Error during CORS check for client ${clientId} and origin ${origin}:`, error);
      res.status(500).json({ message: 'Internal server error during CORS check' });
      return false; // Internal error
  }
} 