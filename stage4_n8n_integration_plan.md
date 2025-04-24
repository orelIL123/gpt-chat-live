# שלב 4 - תוכנית אינטגרציה: קליטת לידים באמצעות n8n Webhook

## הרקע

לאחר שנתקלנו בקשיים מתמשכים בחיבור Firebase ל-Make.com (בעיות OAuth ואי-זמינות לכאורה של מודול Firestore), הוחלט לנסות פלטפורמת אוטומציה חלופית, n8n, כדי ליישם את תהליך קליטת הלידים.

## הפתרון המוצע

נשתמש בפלטפורמת האוטומציה n8n וב-Webhook כדי לקלוט את נתוני הלידים ישירות מהווידג'ט. n8n תהיה אחראית על ביצוע הפעולות הנדרשות: שמירת הליד בפיירבייס ושליחת אימייל דרך SendGrid.

## שלבי הביצוע

1.  **הגדרת חשבון n8n:**
    *   להירשם לשירות הענן של n8n (n8n.cloud) או להתקין אותו עצמאית.

2.  **יצירת Workflow חדש ב-n8n:**
    *   ליצור Workflow ריק חדש בממשק של n8n.

3.  **הוספת טריגר Webhook:**
    *   להוסיף צומת (Node) מסוג "Webhook" בתור הטריגר (הצומת הראשון).
    *   לוודא שהוא מוגדר לקבל בקשות `POST` (לרוב ברירת המחדל).
    *   להעתיק את כתובת ה-Webhook ש-n8n מספק. שימו לב שיש כתובת לבדיקות (Test URL) וכתובת לפרודקשן (Production URL). נצטרך את שתיהן.

4.  **עדכון קוד הווידג'ט (`public/widget.js`):**
    *   לאתר את הפונקציה `sendLeadToApi`.
    *   לשנות את כתובת ה-URL בבקשת ה-`fetch` לכתובת ה-Webhook **החדשה** שקיבלנו מ-n8n (מומלץ להשתמש בכתובת ה-Production URL).
    *   לוודא ששיטת הבקשה נשארת `POST` ושמבנה גוף הבקשה (ה-JSON עם `name`, `contact`, `clientId`, `history`) נשמר.

5.  **בדיקת ה-Webhook וקליטת מבנה נתונים:**
    *   ב-n8n, להעביר את צומת ה-Webhook למצב האזנה לבדיקה ("Listen for test event").
    *   לגשת לאתר שבו מוטמע הווידג'ט (`https://oreli1123.github.io`).
    *   להפעיל את הצ'אט ולעבור את תהליך השארת הפרטים (שם ואיש קשר).
    *   לוודא ש-n8n קלט את הנתונים והציג אותם בממשק הבדיקה. זה יאפשר ל-n8n להבין את מבנה הנתונים עבור השלבים הבאים.

6.  **הוספת צומת Firebase Firestore:**
    *   להוסיף צומת (Node) חדש אחרי ה-Webhook.
    *   לחפש ולהוסיף את הצומת "Firebase".
    *   לבחור במשאב (Resource) "Firestore".
    *   לבחור בפעולה (Operation) "Create Document".
    *   **Credentials:** לחבר את חשבון הפיירבייס שלך. סביר להניח שהאפשרות המומלצת תהיה "Service Account".
        *   ליצור (אם אין) ולהוריד קובץ JSON של מפתח חשבון שירות ממסוף Firebase (Project Settings -> Service accounts -> Generate new private key).
        *   להדביק את תוכן קובץ ה-JSON בשדה המתאים ב-n8n.
    *   **Collection Name:** להזין `leads`.
    *   **Data (JSON):** למפות את הנתונים שהתקבלו מה-Webhook לשדות הרצויים. להשתמש בביטויים (Expressions) של n8n כדי לגשת לנתוני ה-Webhook (למשל, `{{ $json.body.clientId }}`). יש למפות:
        *   `clientId`: `{{ $json.body.clientId }}`
        *   `name`: `{{ $json.body.name }}`
        *   `contact`: `{{ $json.body.contact }}`
        *   `history`: `{{ $json.body.history }}`
        *   `receivedAt`: להשתמש בביטוי כמו `{{ new Date().toISOString() }}` או פונקציה דומה של n8n ליצירת חותמת זמן.
        *   `status`: להזין `new` (כמחרוזת).

7.  **הוספת צומת SendGrid:**
    *   להוסיף צומת (Node) חדש אחרי צומת הפיירבייס.
    *   לחפש ולהוסיף את הצומת "SendGrid".
    *   לבחור בפעולה (Operation) "Email" -> "Send".
    *   **Credentials:** לחבר את חשבון ה-SendGrid שלך. סביר להניח שזה ידרוש הזנת מפתח ה-API של SendGrid.
    *   **From Email:** להזין את כתובת השולח המאומתת שלך.
    *   **To Email:** להזין את כתובת הנמען שאליה יישלחו הלידים.
    *   **Subject:** להזין נושא, ניתן להשתמש בנתונים מה-Webhook (למשל, `ליד חדש מאתר {{ $json.body.clientId }}!`).
    *   **HTML:** לעצב את גוף האימייל ב-HTML, תוך שימוש בנתונים מה-Webhook (למשל, `{{ $json.body.name }}`, `{{ $json.body.contact }}`, `{{ $json.body.history }}`).

8.  **בדיקה והפעלה:**
    *   לבדוק את ה-Workflow על ידי שליחת ליד לדוגמה ולראות שהנתונים נשמרים בפיירבייס והאימייל נשלח.
    *   לשמור את ה-Workflow.
    *   להפעיל (Activate) את ה-Workflow כדי שיוכל לקבל בקשות מכתובת ה-Production URL של ה-Webhook.

## תרשים זרימה (Mermaid)

```mermaid
sequenceDiagram
    participant Widget as Chat Widget (GitHub Pages)
    participant n8n as n8n.io (Webhook)
    participant Firebase as Firebase Firestore
    participant SendGrid as SendGrid API

    Widget->>+n8n: POST /webhook-url (name, contact, clientId, history)
    n8n->>+Firebase: Create Document in 'leads' (leadData)
    Firebase-->>-n8n: Success/Failure
    n8n->>+SendGrid: Send Email (to: targetEmail, from: fromEmail, subject, body)
    SendGrid-->>-n8n: Success/Failure
    n8n-->>-Widget: Webhook Response (e.g., Accepted)