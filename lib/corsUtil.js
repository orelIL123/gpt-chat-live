import { db } from './firebaseAdmin.js';

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

  // Check for clientId *after* handling potential OPTIONS request without origin
  if (!clientId) {
      // If it's an OPTIONS request, it might not have clientId yet. Allow it to pass preflight.
      if (req.method === 'OPTIONS') {
          console.log('OPTIONS request received without clientId, allowing preflight.');
          // Set standard CORS headers needed for preflight, using the provided origin
          res.setHeader('Access-Control-Allow-Origin', origin); // Use the origin from the request header
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          // Indicate preflight success. The actual POST will re-validate CORS with clientId.
          // Sending 204 No Content is common for successful OPTIONS responses
          res.status(204).end(); 
          return false; // Return false to signal the main handler should stop (as response is sent)
      } else {
          // For non-OPTIONS requests, clientId is required.
          console.error('CORS check failed: clientId is missing for non-OPTIONS request.');
          res.status(400).json({ message: 'Client ID is required' }); 
          return false;
      }
  }

  // If we reach here, it's not an OPTIONS request handled above, and clientId IS present.
  // Proceed with Firestore check.
  try {
    const docRef = db.collection('brains').doc(clientId);
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