# AI Question Injection Feature

## Overview
This feature allows AI assistants to programmatically generate and add questions to a Blobby game session via HTTP API.

## Components

### 1. HTTP API Endpoint (`convex/http.ts`)
- **Route**: `POST /api/add-questions`
- **Purpose**: Accept bulk question submissions from external AI services
- **Authentication**: Validates sessionCode + hostId combination
- **Validation**: Comprehensive input validation for all fields
- **Error Handling**: Returns detailed error messages for debugging

### 2. AI Question Modal (`src/components/AIQuestionModal.tsx`)
- **Purpose**: Display copyable API instructions for users
- **Features**:
  - Shows session-specific API endpoint and credentials
  - Two copy buttons: "Copy Full Instructions" (for AI) and "Copy API Details Only"
  - Complete request format with examples
  - Usage instructions
- **Props**:
  - `isOpen`: boolean - controls modal visibility
  - `onClose`: function - close handler
  - `sessionCode`: string - current session code
  - `hostId`: string - current host ID
  - `convexUrl`: string - Convex deployment URL

### 3. Admin View Integration (`src/views/AdminView.tsx`)
- **Button**: "🤖 Have AI add questions" button in questions section header
- **Visibility**: Only shown when session is in "lobby" state
- **Action**: Opens the AIQuestionModal with session details

### 4. Styling (`src/index.css`)
- Modal overlay and content styles
- AI button gradient styling with hover effects
- Code block styling for API examples
- Responsive design for mobile/desktop

## User Flow

1. **Host creates a session** in Admin Panel (stays in lobby)
2. **Host clicks "🤖 Have AI add questions"** button
3. **Modal opens** with API instructions and session credentials
4. **Host copies instructions** and pastes to AI assistant
5. **AI generates questions** and calls the API
6. **Questions appear** in the admin panel instantly
7. **Host starts the game** with AI-generated questions

## API Request Example

```json
POST {CONVEX_URL}/api/add-questions

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

## Security Considerations

1. **Authentication**: hostId must match session.hostId (stored in localStorage)
2. **Authorization**: Only lobby sessions can receive new questions
3. **Validation**: All inputs validated before database insertion
4. **Rate Limiting**: Convex provides built-in rate limiting
5. **Error Messages**: Detailed but don't expose sensitive data

## Technical Details

### Database Schema
Questions are inserted using the existing `questions.create` mutation:
- `sessionId`: Id<"sessions"> - links to parent session
- `text`: string - question text
- `options`: array of `{ text: string }` - answer options
- `correctOptionIndex`: number - index of correct answer (0-based)
- `order`: number - automatically calculated from existing question count
- `timeLimit`: number - defaults to 30 seconds

### Session Validation
The API uses the existing `sessions.getByCode` query to:
1. Find the session by code (case-insensitive)
2. Verify it exists
3. Check hostId matches
4. Ensure status is "lobby"

### Error Handling
- **400 Bad Request**: Missing/invalid fields, wrong session state
- **403 Forbidden**: Invalid hostId for session
- **404 Not Found**: Session doesn't exist
- **500 Internal Server Error**: Database or server errors

## Future Enhancements

Possible improvements:
- [ ] Add support for bulk question updates/edits
- [ ] Allow specifying question order in API
- [ ] Add webhook for question validation
- [ ] Support for question categories/tags
- [ ] Rate limiting per session
- [ ] API key authentication for production use
- [ ] Question preview before committing
- [ ] Support for images in questions

## Testing

See `API_TEST.md` for comprehensive testing instructions including:
- curl examples
- Expected responses
- Validation scenarios
- AI assistant integration examples

## Files Modified/Created

### Created:
- `src/components/AIQuestionModal.tsx` - Modal component
- `API_TEST.md` - Testing documentation
- `AI_QUESTION_FEATURE.md` - This file

### Modified:
- `convex/http.ts` - Added `/api/add-questions` endpoint
- `src/views/AdminView.tsx` - Added button and modal integration
- `src/index.css` - Added modal and button styles

## Dependencies

No new dependencies required. Uses existing:
- Convex HTTP router
- React state management
- Browser Clipboard API
- Existing Convex mutations/queries
