# Chat Widget Integration Plan

**Overall Goal:** Modify the chat widget to capture `clientId` from the URL (with script tag fallback), send chat messages to a new n8n webhook, add a dynamic admin link, and create a basic structure for an admin dashboard page.

## Phase 1: Modify Chat Widget (`public/widget.js`)

1.  **Update `clientId` Retrieval Logic:**
    *   Modify the beginning of the script (around lines 2-12) to first check `window.location.search` for a `clientId` URL parameter.
    *   Use `URLSearchParams` to parse the query string.
    *   If the URL parameter `clientId` exists and is not empty, use its value.
    *   If the URL parameter is missing or empty, *then* attempt to get the `clientId` from the script tag's `data-client-id` attribute (`widgetScriptElement.dataset.clientId`) as a fallback.
    *   Store the final determined ID in the `client_id` variable.
    *   Update the console log/error messages to reflect this new logic.
2.  **Implement n8n Webhook Integration:**
    *   Define a new constant for the webhook URL: `const N8N_CHAT_WEBHOOK_URL = 'https://chatvegosai.app.n8n.cloud/webhook/4a467811-bd9e-4b99-a145-3672a6ae6ed2/chat';`
    *   Create a new asynchronous function, e.g., `async function sendToN8nWebhook(message, clientId)`.
    *   Inside this function:
        *   Check if `clientId` is valid.
        *   Perform a `fetch` POST request to `N8N_CHAT_WEBHOOK_URL`.
        *   Set `Content-Type` header to `application/json`.
        *   Set `mode` to `cors`.
        *   Send the body as JSON: `JSON.stringify({ message: message, clientId: clientId })`.
        *   Add basic `try...catch` for network errors and log them to the console (e.g., `console.error('Failed to send message to n8n webhook:', error);`). This call will be "fire-and-forget".
    *   In the existing `sendMessage` function (around line 257):
        *   After validating the user's input (`text`) and the `client_id`, call `sendToN8nWebhook(text, client_id);`. This should happen relatively early in the function, likely just after `appendMessage("user", text);`.
3.  **Add Dynamic Admin Link:**
    *   Locate the `chatHeader` creation (around line 93).
    *   Before appending the close button (`#close-chat`), create an `<a>` element *only if* `client_id` has a value.
    *   Set its `textContent` to "מעבר לאדמין" (Admin Panel).
    *   Set its `href` dynamically using the `client_id`: `element.href = \`https://admin.chatvegosai.app/client/\${encodeURIComponent(client_id)}\`;`
    *   Set `target="_blank"` to open in a new tab.
    *   Apply basic styling: `color: 'white'`, `textDecoration: 'none'`, `fontSize: '12px'`, `marginRight: '10px'` (adjust as needed for layout).
    *   Prepend this link element to the `chatHeader`'s children or adjust the header's flexbox properties (`justifyContent: 'space-between'`) to position it on the top-right (or top-left for RTL context).

## Phase 2: Create Basic Admin Dashboard Structure

1.  **Define File Structure:** Plan to create a new file: `admin/index.html`.
2.  **Basic HTML Content:** The file will contain standard HTML boilerplate (`<!DOCTYPE html>`, `<html>`, `<head>`, `<body>`).
    *   **Head:** Include `<title>Admin Dashboard</title>` and basic CSS for table styling.
    *   **Body:**
        *   An `<h1>` title like "Admin Dashboard - Client Messages".
        *   Placeholders (`<div>` or similar) for:
            *   Client List/Overview (`id="client-list"`)
            *   Message Table (`id="message-table-container"`) containing a `<table>` with columns for `Client ID`, `Timestamp`, `Message`. Add comments indicating where Name, Email, Phone columns will go later.
            *   Admin Commands section (`id="admin-commands"`).
        *   A basic `<script>` tag with a `console.log` indicating the page loaded and placeholder comments for future data fetching logic.

## Diagram (Conceptual Flow)

```mermaid
graph TD
    A[User visits page with ?clientId=xyz] --> B{Widget Loads};
    B --> C{Get clientId};
    C -- URL Param Found --> D[Use URL clientId];
    C -- URL Param Missing --> E{Check Script Tag};
    E -- Script Tag Found --> F[Use Script Tag clientId];
    E -- Script Tag Missing --> G[Error / No clientId];
    D --> H[Store clientId];
    F --> H;
    H --> I{User Sends Message};
    I --> J[Display User Message];
    J --> K{Send to n8n Webhook};
    J --> L{Send to /api/chat};
    K --> M[Log Success/Error];
    L --> N[Display Bot Response];
    H --> O{Create Chat Header};
    O -- clientId Exists --> P[Add Admin Link with clientId];
    P --> Q[Display Header];
    O -- No clientId --> Q;

    subgraph Admin Page (admin/index.html)
        R[Basic HTML Structure]
        S[Placeholder: Client List]
        T[Placeholder: Message Table]
        U[Placeholder: Admin Commands]
    end

    style K fill:#f9f,stroke:#333,stroke-width:2px
    style P fill:#ccf,stroke:#333,stroke-width:2px
    style R fill:#eee,stroke:#333,stroke-width:1px
    style S fill:#eee,stroke:#333,stroke-width:1px
    style T fill:#eee,stroke:#333,stroke-width:1px
    style U fill:#eee,stroke:#333,stroke-width:1px