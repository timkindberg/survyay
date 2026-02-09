# AI Question Injection API - Testing Guide

## Overview
The AI Question Injection API allows external AI services to programmatically add questions to a Blobby game session.

## Endpoint
```
POST {CONVEX_URL}/api/add-questions
```

## Request Format

```json
{
  "sessionCode": "ABCD",
  "hostId": "user_xyz123",
  "questions": [
    {
      "text": "What is the capital of France?",
      "options": ["London", "Berlin", "Paris", "Madrid"],
      "correctIndex": 2,
      "timeLimit": 30
    }
  ]
}
```

## Testing with curl

### 1. Get your Convex URL
```bash
# From .env.local or convex.json
CONVEX_URL="https://your-deployment.convex.cloud"
```

### 2. Create a test session
- Open the app in your browser
- Go to Admin Panel
- Create a new session (keep it in lobby state)
- Note the session code and your hostId (stored in localStorage as "blobby-host-id")

### 3. Send test request
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "sessionCode": "YOUR_CODE",
    "hostId": "YOUR_HOST_ID",
    "questions": [
      {
        "text": "Test question 1?",
        "options": ["A", "B", "C", "D"],
        "correctIndex": 2,
        "timeLimit": 30
      },
      {
        "text": "Test question 2?",
        "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
        "correctIndex": 0,
        "timeLimit": 30
      }
    ]
  }' \
  "$CONVEX_URL/api/add-questions"
```

## Expected Responses

### Success (200)
```json
{
  "success": true,
  "message": "Successfully added 2 questions",
  "questionIds": ["jx7...", "k12..."]
}
```

### Error: Missing Fields (400)
```json
{
  "error": "Missing required fields: sessionCode, hostId, questions"
}
```

### Error: Session Not Found (404)
```json
{
  "error": "Session with code \"ABCD\" not found"
}
```

### Error: Invalid Host (403)
```json
{
  "error": "Invalid hostId for this session"
}
```

### Error: Wrong Status (400)
```json
{
  "error": "Can only add questions to sessions in lobby state"
}
```

### Error: Invalid Question (400)
```json
{
  "error": "Question 1: options must be an array with at least 2 items"
}
```

## Validation Rules

1. **sessionCode**: Required, string, must exist in database
2. **hostId**: Required, string, must match session.hostId
3. **questions**: Required, non-empty array
4. Each question must have:
   - `text`: Required, non-empty string
   - `options`: Required, array with at least 2 strings
   - `correctIndex`: Required, number, must be valid index (0 to options.length-1)
   - `timeLimit`: Optional, number, defaults to 30 seconds
5. Session must be in "lobby" state (not started)

## Using with AI Assistants

### Example Prompt for Claude/ChatGPT

```
Generate 20 trivia questions about [TOPIC] and add them using this API:

POST https://your-deployment.convex.cloud/api/add-questions

{
  "sessionCode": "ABCD",
  "hostId": "your-host-id",
  "questions": [...]
}

Each question needs: text, options (4 items), correctIndex (0-3)
```

The AI will:
1. Generate the questions
2. Format them in the correct JSON structure
3. Make the HTTP request to add them
4. Report success or errors

## Security Notes

- The hostId acts as authentication - only the session creator can add questions
- hostId is stored in browser localStorage and shown in the admin modal
- Questions can only be added to sessions in "lobby" state
- The API validates all input before inserting into the database
