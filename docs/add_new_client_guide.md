# מדריך הוספת לקוח חדש

מדריך זה מסביר כיצד להוסיף לקוח חדש למערכת הצ'אטבוט, כולל הגדרות ב-Firebase ויצירת קוד ההטמעה לאתר הלקוח.

## שלב 1: הוספת לקוח חדש ב-Firebase Firestore

כל לקוח מיוצג על ידי מסמך ייחודי באוסף `brains` ב-Firebase Firestore. מסמך זה מכיל את ההגדרות הספציפיות של הצ'אטבוט עבור אותו לקוח (כמו הנחיית המערכת, הודעת הפתיחה ושאלות האונבורדינג).

1.  היכנס למסוף Firebase שלך.
2.  נווט אל Firestore Database.
3.  בחר באוסף `brains`.
4.  לחץ על "הוסף מסמך" (Add document).
5.  Firebase ייצור אוטומטית מזהה מסמך ייחודי (Document ID). **שמור מזהה זה! זהו ה-`[CLIENT_ID]` שתצטרך בהמשך.**
6.  הוסף שדות למסמך החדש עם המידע הבא:
    *   `system_prompt` (מחרוזת): הנחיית המערכת עבור מודל ה-AI (לדוגמה: "אתה עוזר וירטואלי לחברת [שם החברה], ענה על שאלות לקוחות בצורה מקצועית וידידותית.").
    *   `welcome_message` (מחרוזת): הודעת הפתיחה שהמשתמש יראה כשהוא פותח את הצ'אט (לדוגמה: "שלום! איך אוכל לעזור לך היום?").
    *   `onboarding_questions` (מערך של מחרוזות): רשימת שאלות אונבורדינג שיוצגו למשתמש בתחילת השיחה (לדוגמה: `["מה שמך?", "במה אתה מתעניין?"]`).
    *   ניתן להוסיף שדות נוספים לפי הצורך עבור הגדרות עתידיות.
7.  לחץ על "שמור" (Save) כדי ליצור את המסמך.

## שלב 2: יצירת קוד ההטמעה לאתר הלקוח

לאחר שיצרת את מסמך הלקוח ב-Firebase וקיבלת את ה-`[CLIENT_ID]` הייחודי, תוכל ליצור את קוד ההטמעה שהלקוח צריך להוסיף לאתר שלו.

קוד ההטמעה הוא תגית `<script>` פשוטה:

```html
<script src="https://gpt-chat-live.vercel.app/widget.js" id="vegos-chat-widget-script" data-client-id="[CLIENT_ID]"></script>
```

1.  החלף את `[CLIENT_ID]` במזהה המסמך הייחודי שיצרת בשלב 1 ב-Firebase.
2.  ספק את קוד ה-HTML המלא הזה ללקוח.
3.  הנחה את הלקוח להוסיף את קוד ההטמעה הזה בקוד ה-HTML של הדף שבו הוא רוצה שהווידג'ט יופיע, רצוי בסוף תגית ה-`<body>` לפני תגית הסגירה `</body>`.

**חשוב:** הכתובת `https://gpt-chat-live.vercel.app/widget.js` תמיד תטען את הגרסה האחרונה של קובץ הווידג'ט שפרסת ל-Vercel. אינך צריך לשנות כתובת זו עבור לקוחות שונים או פריסות חדשות (אלא אם כן שינית את הדומיין הראשי של פריסת Vercel).

על ידי ביצוע שלבים אלו, תוכל להוסיף בקלות לקוחות חדשים ולהגדיר את הצ'אטבוט עבורם באמצעות Firebase, ולספק להם את קוד ההטמעה המתאים לאתר שלהם.