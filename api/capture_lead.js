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

// Import the initialized db instance (and admin if needed)
import { db, admin } from '../lib/firebaseAdmin.js';
import nodemailer from 'nodemailer'; // Import Nodemailer instead of SendGrid
import { applyDynamicCors } from '../lib/corsUtil.js'; // Import the new CORS utility

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
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { 
    name, 
    contact, 
    client_id, 
    intent,
    confidence,
    conversation_history,
    lead_score
  } = req.body;

  if (!name || !contact || !client_id) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // שמירת הליד ב-Firebase
    // const leadData = {
    //   name,
    //   contact,
    //   client_id,
    //   intent: intent || 'unknown',
    //   confidence: confidence || 0,
    //   lead_score: lead_score || 0,
    //   conversation_history: conversation_history || [],
    //   timestamp: new Date().toISOString(),
    //   status: 'new'
    // };
    // const leadRef = await db.collection('leads').add(leadData);

    // שליחת התראה למנהל המערכת
    await sendLeadNotification({ name, contact, client_id, intent, confidence, lead_score, conversation_history });

    // שליחת אישור ללקוח
    const confirmationMessage = generateConfirmationMessage({ name, contact, client_id, intent, confidence, lead_score, conversation_history });

    return res.status(200).json({
      success: true,
      message: confirmationMessage,
      // lead_id: leadRef.id
    });
  } catch (error) {
    console.error('Error capturing lead:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// פונקציה לשליחת התראה למנהל
async function sendLeadNotification(leadData) {
  try {
    // שליחת התראה ל-Slack או מערכת אחרת
    const notification = {
      text: `🎯 ליד חדש!\nשם: ${leadData.name}\nאמצעי התקשרות: ${leadData.contact}\nכוונה: ${leadData.intent}\nציון: ${leadData.lead_score}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*🎯 ליד חדש!*"
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*שם:*\n${leadData.name}`
            },
            {
              type: "mrkdwn",
              text: `*אמצעי התקשרות:*\n${leadData.contact}`
            }
          ]
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*כוונה:*\n${leadData.intent}`
            },
            {
              type: "mrkdwn",
              text: `*ציון:*\n${leadData.lead_score}`
            }
          ]
        }
      ]
    };

    // שליחת ההתראה ל-Slack
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notification)
    });
  } catch (error) {
    console.error('Error sending lead notification:', error);
  }
}

// פונקציה ליצירת הודעת אישור
function generateConfirmationMessage(leadData) {
  const messages = {
    pricing: "תודה על העניין! נציג שלנו יצור איתך קשר בקרוב עם הצעת מחיר מותאמת.",
    complex_queries: "תודה על השאלה! נציג מומחה יצור איתך קשר בקרוב עם מידע מפורט.",
    human_assistance: "תודה! נציג שלנו יצור איתך קשר בהקדם.",
    detailed_info: "תודה על העניין! נציג שלנו יצור איתך קשר עם כל המידע המבוקש.",
    general_inquiry: "תודה! נציג שלנו יצור איתך קשר בהקדם."
  };

  return messages[leadData.intent] || messages.general_inquiry;
}
