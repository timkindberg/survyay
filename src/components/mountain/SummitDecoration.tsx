import type { MountainMode, SkyQuestion } from "./types";
import { wrapText } from "./terrain";

/**
 * Decorative summit area - sunshine, clouds, distant mountains, victory flag
 * In spectator full-screen mode, also displays the current question in the sky
 */
export function SummitDecoration({
  width,
  summitY,
  topY,
  mode,
  skyQuestion,
}: {
  width: number;
  summitY: number;
  topY: number;
  mode: MountainMode;
  skyQuestion?: SkyQuestion | null;
}) {
  const sunSize = mode === "admin-preview" ? 15 : mode === "spectator" ? 35 : 25;
  const cloudScale = mode === "admin-preview" ? 0.4 : mode === "spectator" ? 1 : 0.7;
  const midX = width / 2;

  // Calculate peak position (where the mountain tip would be)
  // Move down enough to ensure flag is visible (flag extends ~42px above peak in spectator mode)
  const peakY = topY + 60;

  // Calculate the sky height for question placement
  const skyHeight = summitY - topY;
  // Question text positioning - in the top portion of the sky, well above the mountain peak
  // Position at 18% down from top to ensure it's above the snow cap
  const questionY = topY + skyHeight * 0.18;

  return (
    <g>
      {/* Sky background */}
      <rect
        x={0}
        y={topY}
        width={width}
        height={summitY - topY + 30}
        fill={`url(#sky-gradient-${mode})`}
      />

      {/* Distant mountains silhouette - more layered for depth */}
      {/* Far layer */}
      <path
        d={`M0 ${summitY + 25}
           L${width * 0.08} ${summitY - 5}
           L${width * 0.18} ${summitY + 8}
           L${width * 0.3} ${summitY - 18}
           L${width * 0.42} ${summitY + 2}
           L${width * 0.55} ${summitY - 12}
           L${width * 0.68} ${summitY + 5}
           L${width * 0.8} ${summitY - 8}
           L${width * 0.92} ${summitY + 10}
           L${width} ${summitY}
           L${width} ${summitY + 30}
           L0 ${summitY + 30} Z`}
        fill="#9EB3C8"
        opacity="0.35"
      />
      {/* Near layer */}
      <path
        d={`M0 ${summitY + 20}
           L${width * 0.12} ${summitY + 5}
           L${width * 0.25} ${summitY + 15}
           L${width * 0.38} ${summitY - 8}
           L${width * 0.52} ${summitY + 10}
           L${width * 0.65} ${summitY - 3}
           L${width * 0.78} ${summitY + 12}
           L${width * 0.9} ${summitY + 2}
           L${width} ${summitY + 8}
           L${width} ${summitY + 25}
           L0 ${summitY + 25} Z`}
        fill="#8BA3B8"
        opacity="0.45"
      />

      {/* Sun with rays - positioned in top-right, but moved down if question is showing */}
      <g>
        {/* Sun rays */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <line
            key={angle}
            x1={width * 0.88}
            y1={topY + sunSize + 15}
            x2={width * 0.88 + Math.cos((angle * Math.PI) / 180) * sunSize * 1.8}
            y2={topY + sunSize + 15 + Math.sin((angle * Math.PI) / 180) * sunSize * 1.8}
            stroke="#FFD700"
            strokeWidth={mode === "admin-preview" ? 1 : 2}
            opacity="0.4"
          />
        ))}
        {/* Outer glow */}
        <circle
          cx={width * 0.88}
          cy={topY + sunSize + 15}
          r={sunSize * 1.2}
          fill={`url(#sun-glow-${mode})`}
        />
        {/* Inner sun */}
        <circle
          cx={width * 0.88}
          cy={topY + sunSize + 15}
          r={sunSize * 0.65}
          fill="#FFF8DC"
        />
      </g>

      {/* Clouds - multiple clouds with varied sizes and opacity, positioned to not overlap with question text */}
      {/* Upper left - small, faint */}
      <Cloud x={width * 0.03} y={topY + 15} scale={cloudScale * 0.5} opacity={0.4} />
      {/* Upper right - medium */}
      <Cloud x={width * 0.85} y={topY + 25} scale={cloudScale * 0.65} opacity={0.6} />
      {/* Mid-left - larger, more visible */}
      <Cloud x={width * 0.08} y={topY + skyHeight * 0.45} scale={cloudScale * 0.8} opacity={0.7} />
      {/* Mid-right - small, subtle */}
      <Cloud x={width * 0.72} y={topY + skyHeight * 0.5} scale={cloudScale * 0.55} opacity={0.5} />
      {/* Lower left (near summit) - medium */}
      <Cloud x={width * 0.15} y={topY + skyHeight * 0.75} scale={cloudScale * 0.7} opacity={0.8} />
      {/* Lower right (near summit) - larger, prominent */}
      <Cloud x={width * 0.78} y={topY + skyHeight * 0.7} scale={cloudScale * 0.9} opacity={0.75} />

      {/* Question text in the sky (spectator mode only) */}
      {skyQuestion && mode === "spectator" && (
        <SkyQuestionDisplay
          question={skyQuestion}
          width={width}
          midX={midX}
          questionY={questionY}
          skyHeight={skyHeight}
          topY={topY}
        />
      )}

      {/* Victory flag at the peak */}
      <SummitFlag
        x={midX}
        y={peakY}
        mode={mode}
      />
    </g>
  );
}

/**
 * Question display in the sky area
 */
function SkyQuestionDisplay({
  question,
  width,
  midX,
  questionY,
  skyHeight,
  topY,
}: {
  question: SkyQuestion;
  width: number;
  midX: number;
  questionY: number;
  skyHeight: number;
  topY: number;
}) {
  // Calculate font size based on viewport width
  const fontSize = Math.max(16, Math.min(32, width / 30));
  const smallFontSize = Math.max(12, fontSize * 0.5);

  // Calculate max text width for wrapping
  const maxTextWidth = width * 0.8;

  // Estimate number of lines for question (rough calculation)
  const charsPerLine = Math.floor(maxTextWidth / (fontSize * 0.5));
  const questionLines = Math.ceil(question.text.length / charsPerLine);
  const lineHeight = fontSize * 1.3;

  // Calculate background dimensions for the question text area
  const bgPadding = 20;
  const bgWidth = maxTextWidth + bgPadding * 2;
  const totalTextHeight = questionLines * lineHeight + 20; // Add some buffer
  const bgHeight = totalTextHeight + bgPadding * 2;
  // Position background Y to center around the question text
  // questionY is the baseline of the first line, so offset up by fontSize
  const bgY = questionY - fontSize - bgPadding + 5;

  return (
    <g className="sky-question">
      {/* Semi-transparent background for readability */}
      <rect
        x={midX - bgWidth / 2}
        y={bgY}
        width={bgWidth}
        height={bgHeight}
        rx={12}
        ry={12}
        fill="rgba(0, 20, 50, 0.55)"
        stroke="rgba(255, 255, 255, 0.15)"
        strokeWidth={1}
      />

      {/* Question number badge */}
      <text
        x={midX}
        y={questionY - fontSize - 5}
        textAnchor="middle"
        fill="rgba(255,255,255,0.8)"
        fontSize={smallFontSize}
        fontWeight="600"
        style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
      >
        Question {question.questionNumber} of {question.totalQuestions}
      </text>

      {/* Question text - with shadow for readability */}
      {/* Shadow layer */}
      <text
        x={midX + 2}
        y={questionY + 2}
        textAnchor="middle"
        fill="rgba(0,0,0,0.5)"
        fontSize={fontSize}
        fontWeight="700"
        style={{
          maxWidth: maxTextWidth,
        }}
      >
        {wrapText(question.text, charsPerLine).map((line, i) => (
          <tspan key={i} x={midX + 2} dy={i === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>

      {/* Main question text */}
      <text
        x={midX}
        y={questionY}
        textAnchor="middle"
        fill="white"
        fontSize={fontSize}
        fontWeight="700"
        style={{
          maxWidth: maxTextWidth,
          filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))",
        }}
      >
        {wrapText(question.text, charsPerLine).map((line, i) => (
          <tspan key={i} x={midX} dy={i === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>

      {/* "Get ready..." message during question_shown phase */}
      {question.phase === "question_shown" && (
        <text
          x={midX}
          y={questionY + questionLines * lineHeight + 30}
          textAnchor="middle"
          fill="rgba(255,255,255,0.7)"
          fontSize={smallFontSize * 1.2}
          fontStyle="italic"
        >
          Get ready...
        </text>
      )}
    </g>
  );
}

/**
 * Victory flag at the mountain summit
 */
function SummitFlag({
  x,
  y,
  mode,
}: {
  x: number;
  y: number;
  mode: MountainMode;
}) {
  const scale = mode === "admin-preview" ? 0.5 : mode === "spectator" ? 1.2 : 0.9;
  const poleHeight = 35 * scale;
  const flagWidth = 25 * scale;
  const flagHeight = 18 * scale;

  return (
    <g>
      {/* Flag pole shadow */}
      <line
        x1={x + 2}
        y1={y}
        x2={x + 2}
        y2={y - poleHeight + 5}
        stroke="rgba(0,0,0,0.2)"
        strokeWidth={3 * scale}
        strokeLinecap="round"
      />
      {/* Flag pole */}
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y - poleHeight}
        stroke="#5C4033"
        strokeWidth={2.5 * scale}
        strokeLinecap="round"
      />
      {/* Flag with wave effect */}
      <path
        d={`M ${x} ${y - poleHeight}
           Q ${x + flagWidth * 0.5} ${y - poleHeight - 3}
             ${x + flagWidth} ${y - poleHeight + 2}
           L ${x + flagWidth - 2} ${y - poleHeight + flagHeight / 2}
           Q ${x + flagWidth * 0.6} ${y - poleHeight + flagHeight * 0.6}
             ${x + flagWidth} ${y - poleHeight + flagHeight}
           Q ${x + flagWidth * 0.4} ${y - poleHeight + flagHeight + 2}
             ${x} ${y - poleHeight + flagHeight}
           Z`}
        fill="#E63946"
      />
      {/* Flag highlight */}
      <path
        d={`M ${x} ${y - poleHeight}
           Q ${x + flagWidth * 0.3} ${y - poleHeight - 2}
             ${x + flagWidth * 0.6} ${y - poleHeight + 1}
           L ${x + flagWidth * 0.5} ${y - poleHeight + flagHeight * 0.4}
           Q ${x + flagWidth * 0.2} ${y - poleHeight + flagHeight * 0.3}
             ${x} ${y - poleHeight + flagHeight * 0.5}
           Z`}
        fill="#F4A4A8"
        opacity="0.5"
      />
      {/* Pole top ornament */}
      <circle
        cx={x}
        cy={y - poleHeight - 2 * scale}
        r={3 * scale}
        fill="#FFD700"
      />
    </g>
  );
}

/**
 * Fluffy cloud shape with depth
 */
function Cloud({ x, y, scale, opacity = 0.95 }: { x: number; y: number; scale: number; opacity?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`} opacity={opacity}>
      {/* Shadow layer */}
      <ellipse cx="2" cy="8" rx="26" ry="14" fill="rgba(150,180,200,0.3)" />
      {/* Main cloud body */}
      <ellipse cx="0" cy="0" rx="24" ry="14" fill="white" opacity="0.95" />
      <ellipse cx="-18" cy="4" rx="16" ry="11" fill="white" opacity="0.95" />
      <ellipse cx="18" cy="3" rx="18" ry="12" fill="white" opacity="0.95" />
      <ellipse cx="8" cy="-6" rx="14" ry="9" fill="white" opacity="0.95" />
      <ellipse cx="-8" cy="-4" rx="12" ry="8" fill="white" opacity="0.95" />
      {/* Highlight layer */}
      <ellipse cx="-5" cy="-8" rx="10" ry="5" fill="white" opacity="1" />
    </g>
  );
}
