# תוכנית שלב 2: לכידת לידים גמישה

## מטרות

*   לאפשר לווידג'ט לאסוף פרטי התקשרות (לידים) ממשתמשים.
*   לספק גמישות לבעלי האתרים לגבי יעד קבלת הלידים (מייל או בסיס נתונים).
*   לבנות תשתית להגדרות ספציפיות לכל לקוח (`client_id`).

## פיצ'רים ליישום

1.  **זיהוי צורך בלכידת ליד (ב-`public/widget.js`):**
    *   **תנאים:**
        *   כאשר ה-API מחזיר תשובה המצביעה על חוסר יכולת לענות (דורש הגדרה ב-API או זיהוי תשובה גנרית).
        *   כאשר המשתמש משתמש במילות מפתח כמו "נציג", "השאר פרטים", "עזרה" וכו'.
    *   **פעולה:** הווידג'ט יציע למשתמש להשאיר פרטים.

2.  **תהליך איסוף פרטים (ב-`public/widget.js`):**
    *   **זרימת שיחה:**
        *   בוט: "בטח, אשמח לעזור. מה שמך?"
        *   (קליטת שם מהמשתמש)
        *   בוט: "ומה כתובת המייל או מספר הטלפון שלך?"
        *   (קליטת פרטי קשר מהמשתמש)
        *   בוט: "תודה! קיבלנו את פרטיך ונציג ייצור קשר בהקדם."
    *   **יישום:** שימוש בפונקציה `appendMessage` ובפונקציה `sendMessage` (עם לוגיקה נוספת לזיהוי שלב איסוף הפרטים).

3.  **שליחת ליד לשרת (מ-`public/widget.js`):**
    *   **נקודת קצה חדשה:** `/api/capture_lead`.
    *   **נתונים לשליחה:** `{ name: '...', contact: '...', clientId: '...', history: [...] }` (ב-JSON body).
    *   **יישום:** שימוש ב-`fetch` עם `method: 'POST'`.

4.  **עיבוד ליד בשרת (קובץ חדש `api/capture_lead.js`):**
    *   **תלות:** `firebase-admin` (כבר קיים ב-`package.json`).
    *   **אתחול Firebase Admin:** שימוש ב-Credentials מתוך משתני סביבה (שיוגדרו על ידי המשתמש ב-Vercel).
    *   **קריאת הגדרות לקוח:**
        *   גישה ל-Firestore, אוסף `clients`, מסמך עם ID = `clientId` שהתקבל.
        *   קריאת השדות `leadDestination` ('email'/'database') ו-`leadTarget` (כתובת מייל / null).
    *   **לוגיקת ניתוב:**
        *   **אם `leadDestination === 'email'`:**
            *   שימוש בספריית שליחת מיילים (למשל, `nodemailer` - יצטרך להוסיף כתלות).
            *   שימוש ב-API Key של שירות מיילים (שיוגדר על ידי המשתמש כמשתנה סביבה).
            *   שליחת מייל עם פרטי הליד לכתובת ב-`leadTarget`.
        *   **אם `leadDestination === 'database'`:**
            *   שמירת פרטי הליד (שם, איש קשר, `clientId`, היסטוריה, timestamp) באוסף `leads` חדש ב-Firestore.
    *   **תשובה לווידג'ט:** החזרת סטטוס הצלחה/כישלון.

## תרשים זרימה

```mermaid
graph TD
    subgraph Widget (widget.js)
        A[שיחה מתנהלת] --> B{האם הבוט לא יודע / המשתמש ביקש נציג?};
        B -- כן --> C[הצגת הודעה: "רוצה להשאיר פרטים?"];
        C --> D[שאלה: "מה שמך?"];
        D --> E[קבלת שם];
        E --> F[שאלה: "מה המייל/טלפון?"];
        F --> G[קבלת מייל/טלפון];
        G --> H[הצגת הודעת אישור: "תודה!"];
        H --> I[שליחת (שם, מייל/טלפון, client_id, היסטוריה) ל-API /api/capture_lead];
        B -- לא --> J[המשך שיחה רגילה];
    end

    subgraph Server (API + Firestore)
        K[/api/capture_lead מקבל נתונים] --> L[קריאת הגדרות הלקוח (client_id) מ-Firestore];
        L --> M{מה יעד הליד (leadDestination)?};
        M -- Email --> N[שליחת מייל לכתובת המוגדרת (leadTarget)];
        M -- Database --> O[שמירת הליד באוסף 'leads' ב-Firestore];
        N --> P[החזרת תשובה לווידג'ט (הצלחה)];
        O --> P;
    end

    style A fill:#ccf,stroke:#333,stroke-width:1px
    style I fill:#cfc,stroke:#333,stroke-width:2px
    style K fill:#f9f,stroke:#333,stroke-width:1px
    style P fill:#ffc,stroke:#333,stroke-width:1px
```

## דרישות תשתית (באחריות המשתמש)

*   לוודא ש-Firestore מופעל בפרויקט Firebase.
*   להגדיר Firebase Admin SDK Credentials כמשתני סביבה ב-Vercel.
*   (אופציונלי, אם נבחר יעד 'email') להגדיר שירות שליחת מיילים (כמו SendGrid) ולהגדיר את מפתח ה-API שלו כמשתנה סביבה ב-Vercel.
*   ליצור אוסף `clients` ב-Firestore ולהוסיף מסמכים עבור כל `client_id` עם השדות `leadDestination` ו-`leadTarget`.

## הערות

*   אינטגרציה ישירה עם CRM נדחית לשלב מאוחר יותר.
*   יש להוסיף טיפול בשגיאות בקוד ה-API (למשל, אם לקוח לא מוגדר, אם שליחת מייל נכשלת).