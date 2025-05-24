import { db } from './firebaseAdmin.js';

export async function applyDynamicCors(req, res, clientId) {
  const origin = req.headers.origin;

  // Allow all origins for development convenience when not in production
  if (process.env.NODE_ENV !== 'production') {
      res.setHeader('Access-Control-Allow-Origin', '*'); // Allow all origins
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      // For OPTIONS requests in development, we can stop here after setting headers
      if (req.method?.toUpperCase() === 'OPTIONS') {
          res.status(204).end();
          return false; // Signal the main handler to stop
      }
      // For non-OPTIONS requests in development, continue processing
      return true; // CORS is allowed
  }

  // If in production, or if NODE_ENV is not set and origin is missing
  if (!origin) {
      console.warn(`CORS check failed for client ${clientId}: No origin header.`);
      // Don't send 403 here, might be a non-browser request or server-to-server
      // Let subsequent logic handle it if origin is strictly required.
      // Returning false indicates CORS headers were *not* set for a specific origin.
      return false; // No specific origin to check against allowed list
  }

  // Handle OPTIONS requests explicitly first
  // Make check case-insensitive
  if (req.method?.toUpperCase() === 'OPTIONS') {
      // For OPTIONS, always return the necessary CORS headers and a success status (204 No Content is standard)
      console.log(`OPTIONS request received for origin: ${origin}. Allowing.`);
      res.setHeader('Access-Control-Allow-Origin', origin); 
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.status(204).end();
      return false; // Signal the main handler to stop, response already sent.
  }

  // If it's not OPTIONS, NOW check for clientId
  if (!clientId) {
      console.error('CORS check failed: clientId is missing for non-OPTIONS request.');
      res.status(400).json({ message: 'Client ID is required' }); 
      return false; // Signal the main handler to stop.
  }

  // If we reach here, it's not OPTIONS, and clientId IS present.
  // Proceed with Firestore check based on origin.
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