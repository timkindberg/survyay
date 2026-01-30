import { useState } from "react";

interface AIQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionCode: string;
  hostId: string;
  convexUrl: string;
}

export function AIQuestionModal({
  isOpen,
  onClose,
  sessionCode,
  hostId,
  convexUrl,
}: AIQuestionModalProps) {
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedApi, setCopiedApi] = useState(false);

  if (!isOpen) return null;

  const apiUrl = `${convexUrl}/api/add-questions`;

  const fullInstructions = `Generate 20 trivia questions about [YOUR TOPIC] and add them to the game using this API:

POST ${apiUrl}
Content-Type: application/json

{
  "sessionCode": "${sessionCode}",
  "hostId": "${hostId}",
  "questions": [
    {
      "text": "What is the capital of France?",
      "options": ["London", "Berlin", "Paris", "Madrid"],
      "correctIndex": 2,
      "timeLimit": 30
    },
    {
      "text": "Which planet is known as the Red Planet?",
      "options": ["Venus", "Mars", "Jupiter", "Saturn"],
      "correctIndex": 1,
      "timeLimit": 30
    }
  ]
}

Requirements:
- Each question must have: text (string), options (array of 4 strings), correctIndex (0-3), timeLimit (optional, defaults to 30 seconds)
- Question text: Keep concise, ideally under 100 characters for readability
- Answer options: Keep short, 2-5 words each, under 40 characters
- Generate all questions at once and send in a single API call
- This will REPLACE all existing questions (not add to them)
- Session must be in lobby state (not started yet)`;

  const apiDetailsOnly = `API Endpoint: ${apiUrl}

Request Body:
{
  "sessionCode": "${sessionCode}",
  "hostId": "${hostId}",
  "questions": [
    {
      "text": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "timeLimit": 30
    }
  ]
}`;

  async function copyFullInstructions() {
    try {
      await navigator.clipboard.writeText(fullInstructions);
      setCopiedFull(true);
      setTimeout(() => setCopiedFull(false), 2000);
    } catch (error) {
      console.error("Failed to copy instructions:", error);
    }
  }

  async function copyApiDetails() {
    try {
      await navigator.clipboard.writeText(apiDetailsOnly);
      setCopiedApi(true);
      setTimeout(() => setCopiedApi(false), 2000);
    } catch (error) {
      console.error("Failed to copy API details:", error);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content ai-question-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>AI Question Injection API</h2>
          <button onClick={onClose} className="modal-close">
            X
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Use this API to have an AI generate and add questions to your game session.
            Copy the instructions below and provide them to an AI assistant.
          </p>

          <div className="api-section">
            <h3>Full Instructions (for AI)</h3>
            <pre className="code-block">{fullInstructions}</pre>
            <button
              onClick={copyFullInstructions}
              className={`copy-button ${copiedFull ? "copied" : ""}`}
            >
              {copiedFull ? "Copied!" : "Copy Full Instructions"}
            </button>
          </div>

          <div className="api-section">
            <h3>API Details Only</h3>
            <pre className="code-block">{apiDetailsOnly}</pre>
            <button
              onClick={copyApiDetails}
              className={`copy-button ${copiedApi ? "copied" : ""}`}
            >
              {copiedApi ? "Copied!" : "Copy API Details"}
            </button>
          </div>

          <div className="api-info">
            <h4>How to use:</h4>
            <ol>
              <li>Copy the "Full Instructions" above</li>
              <li>Paste into an AI assistant (like Claude, ChatGPT, etc.)</li>
              <li>Replace [YOUR TOPIC] with your desired topic</li>
              <li>The AI will generate questions and call the API to add them</li>
              <li>Questions will appear in the game below</li>
            </ol>
            <p className="note">
              Note: Questions can only be added while the session is in "lobby" state (not started).
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="primary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
