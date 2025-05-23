/**
 * CAPTURE LEAD MODULE - UPDATED VERSION
 * * This module handles lead capture functionality for the Vegos Chatbot system.
 * It captures lead information, stores it in Firebase, and sends email notifications
 * using Nodemailer with Zoho Mail's SMTP server.
 * * CHANGES FROM PREVIOUS VERSION:
 * - Replaced SendGrid with Nodemailer + Zoho Mail SMTP
 * - Added retry logic for failed email attempts
 * - Improved error handling and logging
 * - Added detailed comments for better maintainability
 * - FIXED: Added CORS handling to allow frontend calls.
 * - FIXED: Added check for SLACK_WEBHOOK_URL environment variable.
 * - FIXED: Enhanced error messages for better debugging.
 * * REQUIRED ENVIRONMENT VARIABLES:
 * - FIREBASE_SERVICE_ACCOUNT: JSON string containing Firebase service account credentials
 * - ZOHO_USER: Zoho Mail username (e.g., chatvegos@chatvegos.chat)
 * - ZOHO_PASS: Zoho Mail password or app-specific password (required if 2FA is enabled)
 * - ZOHO_FROM_NAME: Display name for the sender (e.g., "Vegos Chatbot")
 * - MAX_RETRY_ATTEMPTS: Maximum number of retry attempts for failed emails (default: 3)
 * - RETRY_DELAY_BASE: Base delay in milliseconds between retries (default: 1000)
 * - SLACK_WEBHOOK_URL: URL for Slack incoming webhook (optional, but recommended if used)
 * - ADMIN_EMAIL: Email address for lead notifications (optional, has default)
 * * USAGE:
 * 1. Set all required environment variables
 * 2. Import this module in your serverless function
 * 3. Export the handler function as your API endpoint
 * * DEPENDENCIES:
 * - firebase-admin: For Firebase Firestore operations
 * - nodemailer: For email sending functionality
 * * Make sure to install nodemailer if not already installed:
 * npm install nodemailer
 */

// ייבוא מופע ה-db המאותחל (ו-admin אם נדרש)
import { db } from '../lib/firebaseAdmin.js';
// ייבוא Nodemailer
import nodemailer from 'nodemailer';
// ייבוא כלי ה-CORS החדש
import { applyDynamicCors } from '../lib/corsUtil.js';

// --- Nodemailer עם תצורת Zoho Mail ---
// יצירת אובייקט transporter לשימוש חוזר באמצעות Zoho Mail SMTP
const zohoUser = process.env.ZOHO_USER || 'chatvegos@chatvegos.chat';
const zohoPass = process.env.ZOHO_PASS;
const fromName = process.env.ZOHO_FROM_NAME || 'Vegos Chatbot';

// תצורת ניסיונות חוזרים לשליחת מייל
const MAX_RETRY_ATTEMPTS = parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10);
const RETRY_DELAY_BASE = parseInt(process.env.RETRY_DELAY_BASE || '1000', 10); // השהיה בסיסית באלפיות השנייה (שנייה אחת)

// יצירת ה-transporter רק אם פרטי ההתחברות זמינים
let transporter = null;
if (zohoUser && zohoPass) {
  transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465,
    secure: true, // נכון עבור פורט 465 (SSL/TLS)
    auth: {
      user: zohoUser,
      pass: zohoPass,
    },
  });
  console.log("[CAPTURE_LEAD] Nodemailer configured with Zoho Mail SMTP. Transporter is ready.");
} else {
  console.error("[CAPTURE_LEAD] Zoho Mail credentials (ZOHO_USER, ZOHO_PASS) are not configured. Email sending will fail.");
  console.log("[CAPTURE_LEAD] Nodemailer transporter NOT configured due to missing credentials.");
}
// --- סוף תצורת Nodemailer ---

/**
 * פונקציית עזר לשליחת מייל עם לוגיקת ניסיונות חוזרים
 * @param {Object} mailOptions - אפשרויות המייל (to, subject, text, html)
 * @param {number} attempt - מספר הניסיון הנוכחי (מתחיל מ-1)
 * @returns {Promise<Object>} - תוצאת שליחת המייל
 */
async function sendEmailWithRetry(mailOptions, attempt = 1) {
  if (!transporter) {
    throw new Error('[CAPTURE_LEAD] Email transporter not configured. Check ZOHO_USER and ZOHO_PASS environment variables.');
  }

  try {
    // ניסיון שליחת המייל
    const info = await transporter.sendMail(mailOptions);
    console.log(`[CAPTURE_LEAD] Email sent successfully on attempt ${attempt}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    // רישום השגיאה עם מידע על הניסיון
    console.error(`[CAPTURE_LEAD] Email sending failed on attempt ${attempt}/${MAX_RETRY_ATTEMPTS}:`, error);

    // בדיקה אם יש לנסות שוב
    if (attempt < MAX_RETRY_ATTEMPTS) {
      // חישוב השהיה אקספוננציאלית: base * 2^(attempt-1)
      const delay = RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
      console.log(`[CAPTURE_LEAD] Retrying in ${delay}ms...`);

      // המתנה להשהיה המחושבת
      await new Promise(resolve => setTimeout(resolve, delay));

      // ניסיון חוזר עם מונה ניסיונות מוגדל
      return sendEmailWithRetry(mailOptions, attempt + 1);
    } else {
      // הושג מספר הניסיונות המקסימלי, זריקת השגיאה
      throw new Error(`[CAPTURE_LEAD] Failed to send email after ${MAX_RETRY_ATTEMPTS} attempts: ${error.message}`);
    }
  }
}

export default async function handler(req, res) {
  console.log("[CAPTURE_LEAD] Function handler started."); // לוג חדש להתחלת הפונקציה

  // קבלת clientId מוקדם לצורך בדיקת CORS
  const clientId = req.body?.client_id || req.query?.client_id;

  // החלת בדיקת CORS *לפני* כל לוגיקה אחרת
  const corsPassed = await applyDynamicCors(req, res, clientId);

  // אם בדיקת CORS נכשלה, עצור את העיבוד.
  if (!corsPassed) {
      if (req.method === 'OPTIONS' && !req.headers.origin) {
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          return res.status(200).end();
      }
      return;
  }

  // טיפול בבקשת OPTIONS preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

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

  // לוג של הנתונים המתקבלים
  console.log("[CAPTURE_LEAD] Received request body:", { name, contact, client_id, intent, confidence, lead_score, conversation_history: conversation_history ? conversation_history.length : 0 });

  if (!name || !contact || !client_id) {
    console.error("[CAPTURE_LEAD] Missing required fields:", { name, contact, client_id }); // לוג שגיאה מפורט יותר
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // שמירת הליד ב-Firebase
    const leadData = {
      name,
      contact,
      client_id,
      intent: intent || 'unknown',
      confidence: confidence || 0,
      lead_score: lead_score || 0,
      conversation_history: conversation_history || [],
      timestamp: new Date().toISOString(),
      status: 'new'
    };
    const leadRef = await db.collection('leads').add(leadData);
    console.log(`[CAPTURE_LEAD] Lead saved to Firestore with ID: ${leadRef.id}`); // לוג על שמירת ליד

    // שליחת התראה למנהל המערכת
    await sendLeadNotification({ name, contact, client_id, intent, confidence, lead_score, conversation_history });

    // שליחת אישור ללקוח (אם רלוונטי)
    const confirmationMessage = generateConfirmationMessage({ name, contact, client_id, intent, confidence, lead_score, conversation_history });

    return res.status(200).json({
      success: true,
      message: confirmationMessage,
      lead_id: leadRef.id
    });
  } catch (error) {
    console.error('[CAPTURE_LEAD] Error capturing lead:', error);
    return res.status(500).json({ message: 'Internal server error', details: error.message }); // פרטים נוספים בשגיאה
  }
}

// פונקציה לשליחת התראה למנהל
async function sendLeadNotification(leadData) {
  console.log("[CAPTURE_LEAD] Attempting to send lead notification...");
  try {
    // שליחת התראה ל-Slack
    if (process.env.SLACK_WEBHOOK_URL) { // בדיקה אם SLACK_WEBHOOK_URL מוגדר
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

      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notification)
      });
      console.log("[CAPTURE_LEAD] Slack notification sent."); // לוג על שליחת סלאק
    } else {
      console.warn("[CAPTURE_LEAD] SLACK_WEBHOOK_URL is not configured. Skipping Slack notification."); // אזהרה אם SLACK_WEBHOOK_URL חסר
    }

    // שליחת מייל למנהל
    const mailOptions = {
      from: `"${fromName}" <${zohoUser}>`,
      to: process.env.ADMIN_EMAIL || 'vegoschat@gmail.com',
      subject: `ליד חדש - ${leadData.name}`,
      html: `
        <h2>ליד חדש מהצ'אטבוט</h2>
        <p><strong>שם:</strong> ${leadData.name}</p>
        <p><strong>אמצעי התקשרות:</strong> ${leadData.contact}</p>
        <p><strong>כוונה:</strong> ${leadData.intent}</p>
        <p><strong>ציון ליד:</strong> ${leadData.lead_score}</p>
        <p><strong>תאריך:</strong> ${new Date().toLocaleString('he-IL')}</p>
        
        <h3>היסטוריית השיחה:</h3>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
          ${leadData.conversation_history.map(msg => `
            <p><strong>${msg.role}:</strong> ${msg.text}</p>
          `).join('')}
        </div>
      `
    };

    console.log("[CAPTURE_LEAD] Calling sendEmailWithRetry...");
    await sendEmailWithRetry(mailOptions);
  } catch (error) {
    console.error('[CAPTURE_LEAD] Error sending lead notification:', error);
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
