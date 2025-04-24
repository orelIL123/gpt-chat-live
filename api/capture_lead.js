/**
 * CAPTURE LEAD MODULE - UPDATED VERSION
 * 
 * This module handles lead capture functionality for the Vegos Chatbot system.
 * It captures lead information, stores it in Firebase, and sends email notifications
 * using Nodemailer with Zoho Mail's SMTP server.
 * 
 * CHANGES FROM PREVIOUS VERSION:
 * - Replaced SendGrid with Nodemailer + Zoho Mail SMTP
 * - Added retry logic for failed email attempts
 * - Improved error handling and logging
 * - Added detailed comments for better maintainability
 * 
 * REQUIRED ENVIRONMENT VARIABLES:
 * - FIREBASE_SERVICE_ACCOUNT: JSON string containing Firebase service account credentials
 * - ZOHO_USER: Zoho Mail username (e.g., chatvegos@chatvegos.chat)
 * - ZOHO_PASS: Zoho Mail password or app-specific password (required if 2FA is enabled)
 * - ZOHO_FROM_NAME: Display name for the sender (e.g., "Vegos Chatbot")
 * - MAX_RETRY_ATTEMPTS: Maximum number of retry attempts for failed emails (default: 3)
 * - RETRY_DELAY_BASE: Base delay in milliseconds between retries (default: 1000)
 * 
 * USAGE:
 * 1. Set all required environment variables
 * 2. Import this module in your serverless function
 * 3. Export the handler function as your API endpoint
 * 
 * DEPENDENCIES:
 * - firebase-admin: For Firebase Firestore operations
 * - nodemailer: For email sending functionality
 * 
 * Make sure to install nodemailer if not already installed:
 * npm install nodemailer
 */

import admin from 'firebase-admin';
import nodemailer from 'nodemailer'; // Import Nodemailer instead of SendGrid
import { applyDynamicCors } from '../lib/corsUtil.js'; // Import the new CORS utility

// --- Firebase Admin Initialization ---
// Uses FIREBASE_SERVICE_ACCOUNT environment variable containing the JSON key file content
try {
  if (!admin.apps.length) {
    const serviceAccountEnvVar = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountEnvVar) {
      throw new Error('Firebase Service Account JSON was not found in environment variable FIREBASE_SERVICE_ACCOUNT.');
    }
    // Parse the JSON string from the environment variable
    const serviceAccount = JSON.parse(serviceAccountEnvVar);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount), // Use the parsed service account object
    });
    console.log("Firebase Admin Initialized using FIREBASE_SERVICE_ACCOUNT variable.");
  }
} catch (error) {
  console.error('Firebase Admin Initialization Error:', error);
  // Log the problematic env var content *carefully* for debugging if needed, but avoid logging secrets in production
  // console.error('FIREBASE_SERVICE_ACCOUNT content (first 50 chars):', process.env.FIREBASE_SERVICE_ACCOUNT?.substring(0, 50));
}
const db = admin.firestore();
// --- End Firebase Admin Initialization ---

// --- Nodemailer with Zoho Mail Configuration ---
// Create a reusable transporter object using Zoho Mail SMTP
const zohoUser = process.env.ZOHO_USER || 'chatvegos@chatvegos.chat'; // Default to the provided email if env var not set
const zohoPass = process.env.ZOHO_PASS;
const fromName = process.env.ZOHO_FROM_NAME || 'Vegos Chatbot';

// Email retry configuration
const MAX_RETRY_ATTEMPTS = parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10);
const RETRY_DELAY_BASE = parseInt(process.env.RETRY_DELAY_BASE || '1000', 10); // Base delay in ms (1 second)

// Create the transporter only if credentials are available
let transporter = null;
if (zohoUser && zohoPass) {
  transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465,
    secure: true, // true for port 465 (SSL/TLS)
    auth: {
      user: zohoUser,
      pass: zohoPass,
    },
  });
  console.log("Nodemailer configured with Zoho Mail SMTP.");
} else {
  console.error("Zoho Mail credentials (ZOHO_USER, ZOHO_PASS) are not configured. Email sending will fail.");
}
// --- End Nodemailer Configuration ---

/**
 * Helper function to send email with retry logic
 * @param {Object} mailOptions - Email options (to, subject, text, html)
 * @param {number} attempt - Current attempt number (starting from 1)
 * @returns {Promise<Object>} - Email sending result
 */
async function sendEmailWithRetry(mailOptions, attempt = 1) {
  if (!transporter) {
    throw new Error('Email transporter not configured. Check ZOHO_USER and ZOHO_PASS environment variables.');
  }

  try {
    // Attempt to send the email
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully on attempt ${attempt}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    // Log the error with attempt information
    console.error(`Email sending failed on attempt ${attempt}/${MAX_RETRY_ATTEMPTS}:`, error);
    
    // Check if we should retry
    if (attempt < MAX_RETRY_ATTEMPTS) {
      // Calculate exponential backoff delay: base * 2^(attempt-1)
      const delay = RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
      console.log(`Retrying in ${delay}ms...`);
      
      // Wait for the calculated delay
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Retry with incremented attempt counter
      return sendEmailWithRetry(mailOptions, attempt + 1);
    } else {
      // Max retries reached, throw the error
      throw new Error(`Failed to send email after ${MAX_RETRY_ATTEMPTS} attempts: ${error.message}`);
    }
  }
}

export default async function handler(req, res) {
  // Get clientId early for CORS check
  const clientId = req.body?.clientId || req.query?.clientId; // Try getting from body or query

  // Apply CORS check *before* any other logic
  // The function will handle setting headers or sending 403
  const corsPassed = await applyDynamicCors(req, res, clientId);

  // If CORS failed (403 sent or headers not set for a non-origin request), stop processing.
  // Also handle the case where clientId was missing (applyDynamicCors sends 400).
  if (!corsPassed) {
      // applyDynamicCors already sent the response (403 or 400) or decided not to set headers.
      // If no origin was present, we might still want to allow OPTIONS.
      if (req.method === 'OPTIONS' && !req.headers.origin) {
          // Allow OPTIONS even without origin for simple requests, but don't set Allow-Origin
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          return res.status(200).end();
      }
      // Otherwise, if corsPassed is false, the response was already handled.
      return; 
  }

  // Handle OPTIONS preflight request (CORS headers already set by applyDynamicCors if origin was valid)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle actual POST request
  if (req.method !== 'POST') {
    // We already set CORS headers if origin was valid, so just send 405
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // --- Existing POST logic starts here ---
  // Ensure client_id is available (already partially checked in CORS, but double-check)
  if (!clientId) {
      return res.status(400).json({ message: 'Client ID is required in the request body or query string.' });
  }

  // Check if Firebase was initialized successfully before proceeding
  if (!admin.apps.length) {
    console.error("Firebase Admin SDK not initialized. Cannot process request.");
    return res.status(500).json({ message: 'Server configuration error: Firebase connection failed.' });
  }

  // Ensure Nodemailer is configured before proceeding
  if (!transporter) {
    console.error("Nodemailer not configured. Cannot process request.");
    return res.status(500).json({ message: 'Server configuration error: Email service not configured.' });
  }

  const { name, contact, history } = req.body;

  if (!name || !contact || !clientId) {
    return res.status(400).json({ message: 'Missing required lead data (name, contact, clientId)' });
  }

  try {
    // 1. Fetch client settings from Firestore 'brains' collection
    const clientRef = db.collection('brains').doc(clientId);
    const clientDoc = await clientRef.get();

    if (!clientDoc.exists) {
      console.error(`Client settings not found in 'brains' for clientId: ${clientId}`);
      return res.status(404).json({ message: 'Client configuration not found.' });
    }

    const clientSettings = clientDoc.data();
    // Read the target email from the 'leadTargetEmail' field
    const targetEmail = clientSettings.leadTargetEmail;

    if (!targetEmail) {
      console.error(`Target email (leadTargetEmail) not configured for clientId: ${clientId} in 'brains' collection.`);
      return res.status(500).json({ message: 'Server configuration error: Missing target email for client.' });
    }

    console.log(`Processing lead for ${clientId}. Target Email: ${targetEmail}`);

    // Format history for readability (optional)
    const formattedHistory = history?.map(msg => `${msg.role}: ${msg.text}`).join('\n') || 'No history provided.';

    // 2. Save lead to Firestore 'leads' collection
    const leadsCollection = db.collection('leads');
    const leadData = {
      clientId: clientId,
      name: name,
      contact: contact,
      history: history || [], // Store the original history array
      receivedAt: admin.firestore.FieldValue.serverTimestamp(), // Add a timestamp
      status: 'new' // Optional: Add a status field
    };

    try {
      const leadDocRef = await leadsCollection.add(leadData);
      console.log(`Lead saved to Firestore with ID: ${leadDocRef.id} for client ${clientId}`);
    } catch (firestoreError) {
      console.error(`Error saving lead to Firestore for ${clientId}:`, firestoreError);
      // If Firestore save fails, return an error immediately. Saving the lead is critical.
      return res.status(500).json({ message: 'Failed to save lead data to database.' });
    }

    // 3. Send email using Nodemailer with Zoho Mail (Only if Firestore save succeeded)
    const mailOptions = {
      from: {
        name: fromName,
        address: zohoUser
      },
      to: targetEmail, // Target email from client settings
      subject: `ליד חדש מאתר ${clientId}!`, // Updated subject
      text: `היי יש ליד חדש באתר שלך!\n\nפרטי הליד:\nשם: ${name}\nפרטי קשר: ${contact}\n\nהיסטוריית שיחה:\n${formattedHistory}\n\nכדי שתטפל בו! עד אז אני כאן.`, // Updated email body
      html: `<p>היי יש ליד חדש באתר שלך!</p>
             <p><strong>פרטי הליד:</strong></p>
             <ul>
               <li><strong>שם:</strong> ${name}</li>
               <li><strong>פרטי קשר:</strong> ${contact}</li>
             </ul>
             <p><strong>היסטוריית שיחה:</strong></p>
             <pre>${formattedHistory}</pre>
             <p>כדי שתטפל בו! עד אז אני כאן.</p>`, // Updated HTML email body
    };

    try {
      // Use our retry-enabled email sending function
      await sendEmailWithRetry(mailOptions);
      console.log(`Email sent successfully to ${targetEmail} for client ${clientId}`);
      // Success: Lead saved and email sent
      return res.status(200).json({ message: 'Lead captured, saved, and email sent.' });
    } catch (emailError) {
      console.error(`Error sending email for ${clientId} to ${targetEmail}:`, emailError);
      // Firestore save succeeded, but email failed. Return a success status but indicate email failure.
      // We return 200 because the primary goal (saving the lead) succeeded.
      return res.status(200).json({ message: 'Lead saved, but email notification failed.' });
    }

  } catch (error) {
    // Catch other unexpected errors during processing (e.g., fetching client settings)
    console.error('Error processing lead capture:', error);
    return res.status(500).json({ message: 'Internal Server Error processing lead.' });
  }
}
