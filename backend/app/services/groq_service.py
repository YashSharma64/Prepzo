import os
import re
import json
import time
import logging
from typing import Optional
from groq import Groq
from dotenv import load_dotenv
from app.services.deadline_service import compute_priority_score, assign_priority

load_dotenv()

logger = logging.getLogger("prepzo.groq")

api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=api_key) if api_key and api_key != "your_groq_api_key_here" else None

# ─────────────────────────────────────────────
# Mode Configuration
# ─────────────────────────────────────────────

MODE_CONFIG = {
    "survival": {
        "q_min": 5,
        "q_max": 8,
        "focus": "highest-yield, exam-critical topics only",
        "depth": "concise — key points only, 1-2 sentences per solution",
        "difficulty_mix": "30% easy, 50% medium, 20% hard",
        "strategy": (
            "Aggressive Pareto filtering. Select ONLY the concepts that appear most "
            "frequently in past exams. Every question must maximize marks-per-minute. "
            "Skip low-probability and edge-case topics entirely."
        ),
        "prob_floor": 0.70,
        # Full mode needs long solutions (5-8 sentences per question × 25 questions).
        # Survival solutions are 1-2 sentences so 2500 is more than enough.
        "max_tokens": 2500,
    },
    "balanced": {
        "q_min": 10,
        "q_max": 15,
        "focus": "medium to high importance topics with broad coverage",
        "depth": "moderate — clear explanation, 3-5 sentences per solution",
        "difficulty_mix": "20% easy, 50% medium, 30% hard",
        "strategy": (
            "Cover all important topics with good breadth. Balance theory with "
            "application questions. Include both must-know and should-know concepts."
        ),
        "prob_floor": 0.58,
        "max_tokens": 4500,
    },
    "full": {
        "q_min": 18,
        "q_max": 25,
        "focus": "comprehensive coverage including edge cases and advanced topics",
        "depth": "detailed — thorough explanation with examples, 5-8 sentences per solution",
        "difficulty_mix": "15% easy, 40% medium, 45% hard",
        "strategy": (
            "Deep comprehensive coverage across all topics. Include advanced concepts, "
            "edge cases, cross-topic questions, and nuanced applications. Students have "
            "time for depth — use it."
        ),
        "prob_floor": 0.52,
        # Full-mode worst case: 25 questions × ~950 chars (question + long solution + fields)
        # ≈ 23750 chars / 4 ≈ 5937 tokens. 6500 leaves a safe margin within the
        # llama-3.3-70b-versatile total context window (8192 − ~1300 prompt ≈ 6892 available).
        "max_tokens": 6500,
    },
}

VALID_TYPES = {"MCQ", "coding", "theory"}
VALID_DIFFICULTIES = {"easy", "medium", "hard"}

# Cap chatbot conversation history to keep total context under 8192 tokens.
# 20 messages × ~150 tokens avg + system prompt (~900 tokens) + output (1024) ≈ 4924.
_MAX_CHAT_HISTORY = 20


# ─────────────────────────────────────────────
# Prompt Builder V2
# ─────────────────────────────────────────────


# ─────────────────────────────────────────────
# Per-mode prompt components
# ─────────────────────────────────────────────

_QUESTION_STYLES = {
    "survival": (
        "QUESTION STYLE — SURVIVAL (time-critical: 1-3 days left):\n"
        "  - Favour fast-answer formats: recall, one-line definition, short comparison, MCQ\n"
        "  - Each question should be answerable in 2-4 sentences — no essay questions\n"
        "  - Avoid multi-step design or scenario analysis — too slow under exam pressure\n"
        "  - Strong openings: 'What is...', 'Which of the following...', "
        "'State the difference between...', 'Identify...', 'Define...'"
    ),
    "balanced": (
        "QUESTION STYLE — BALANCED (4-7 days left):\n"
        "  - Mix formats: ~30% recall/definition, ~30% comparison, ~25% application-in-context, ~15% MCQ\n"
        "  - Include real-world context: 'In a REST API...', 'A team is designing...', "
        "'When building a system that...'\n"
        "  - Test understanding, not just memory — ask why and when, not just what\n"
        "  - Strong openings: 'Compare...', 'When would you use...', 'How does...', 'A developer...'"
    ),
    "full": (
        "QUESTION STYLE — FULL (8+ days, depth mode):\n"
        "  - Emphasise depth: ~20% recall, ~25% design/architecture, ~30% scenario/application, ~25% mechanism/trade-off\n"
        "  - Include cross-topic questions that connect 2+ concepts\n"
        "  - At least 3 questions should require multi-point analysis or design justification\n"
        "  - Strong openings: 'Design a...', 'A system encounters...', "
        "'Explain the trade-offs between...', 'Under what conditions...', "
        "'Compare the architectural approaches to...'"
    ),
}

# Concrete solution format instructions — mode-specific with worked examples.
# These replace the vague "concise — key points only" description.
_SOLUTION_FORMATS = {
    "survival": (
        "Write 1-3 sentences: core answer + the 1-2 most exam-critical facts.\n"
        "      End with: 'Exam trap: [one common mistake students make].'\n"
        "      Be tactical, not encyclopedic.\n"
        "      Good example: 'Observer = subject auto-notifies all registered observers on state change. "
        "Key: loose coupling, one-to-many dependency. "
        "Exam trap: confusing Observer (broadcast to all) with Mediator (centralised routing through one object).'"
    ),
    "balanced": (
        "Write 3-5 sentences: [what it is + how it works] → [why it matters] → [exam application angle].\n"
        "      Include one concrete example. End with: 'Also review: [one related concept].'\n"
        "      Good example: 'Observer Pattern defines a subscription mechanism where a subject "
        "notifies all registered observers on state change. It promotes loose coupling — "
        "the subject knows nothing about its observers beyond the interface. "
        "In exams, expect UML diagram questions and event-listener examples (DOM, React state). "
        "Also review: Mediator Pattern.'"
    ),
    "full": (
        "Write 5-8 sentences: [mechanism — how it works] → [concrete real-world example] → "
        "[trade-offs and when to use] → [edge case or failure mode] → [advanced exam angle].\n"
        "      Be thorough and precise.\n"
        "      Good example: 'Observer Pattern establishes a publish-subscribe mechanism where "
        "subjects maintain a dynamic list of observers and call their update() method on state change. "
        "Node.js EventEmitter is the canonical implementation — emitters broadcast events, "
        "listeners subscribe. Use when you need loosely coupled event-driven systems across "
        "multiple components. Trade-off: can cause unexpected cascading updates if observers "
        "modify state — guard with change-control flags. Thread-safety is an edge case in "
        "concurrent environments. Advanced angle: contrast with Reactive streams (RxJS/Project Reactor) "
        "which add back-pressure and transformation pipelines.'"
    ),
}

_QUESTION_FORMAT_PALETTE = """QUESTION FORMAT VARIETY — use AT LEAST 5 different formats across your questions:
  [RECALL]      "What is X?" / "Define X" / "State the purpose of X in Y"
  [COMPARE]     "Compare X vs Y — what are the key differences and when do you prefer each?"
  [APPLICATION] "You are designing [scenario]. How would you apply X? Why is it appropriate here?"
  [MECHANISM]   "Explain how X works internally. Why does Y happen as a result?"
  [PITFALL]     "What is the most common mistake when using X? How do you recognise and avoid it?"
  [TRADEOFF]    "What are the advantages and limitations of X compared to Y in context Z?"
  [DESIGN]      "Design a solution for [problem] using X. Justify your architectural choices."
  [SCENARIO]    "A developer encounters [specific problem]. What went wrong and how do you fix it?"
  [CODING]      "Write a function/script to implement [algorithm/feature]. Handle edge cases. Must include leetcode, hackerrank, geeksforgeeks style questions if possible or require."

VARIETY ENFORCEMENT:
  - Do NOT start more than 2 questions with the same opening word (Explain, Describe, What, How, etc.)
  - Do NOT use the phrase "key concepts" more than once across all questions
  - No two consecutive questions should use the same format type
  - Questions must feel genuinely distinct in structure, not just in topic"""


def build_prompt(
    subject: str,
    topics: list,
    mode: str,
    weights: dict = None,
    pdf_text: str = None,
    topic_insights: dict = None,
) -> str:
    cfg = MODE_CONFIG.get(mode, MODE_CONFIG["balanced"])
    q_min, q_max = cfg["q_min"], cfg["q_max"]

    if weights:
        sorted_topics = sorted(weights.items(), key=lambda x: -x[1])
        topic_lines_list = []
        for t, w in sorted_topics:
            insight = f" [MUST USE QUESTION TYPE: {topic_insights[t].predicted_type}]" if topic_insights and t in topic_insights else ""
            topic_lines_list.append(f"  - {t} (importance: {w:.2f}){insight}")
        topic_lines = "\n".join(topic_lines_list)
        high_priority = [t for t, w in sorted_topics if w >= 0.8]
        medium_priority = [t for t, w in sorted_topics if 0.4 <= w < 0.8]
    else:
        topic_lines_list = []
        for t in topics:
            insight = f" [MUST USE QUESTION TYPE: {topic_insights[t].predicted_type}]" if topic_insights and t in topic_insights else ""
            topic_lines_list.append(f"  - {t}{insight}")
        topic_lines = "\n".join(topic_lines_list)
        high_priority = topics[: max(1, len(topics) // 3)]
        medium_priority = topics[len(high_priority) :]

    dist_rules = []
    if high_priority:
        dist_rules.append(
            f"HIGH IMPORTANCE topics ({', '.join(high_priority[:5])}): "
            f"must appear in at least 2 questions each — these are exam staples"
        )
    if medium_priority:
        dist_rules.append("MEDIUM IMPORTANCE topics: 1-2 questions each")
    if mode == "survival":
        dist_rules.append("LOW IMPORTANCE topics: skip entirely — no time for these")
    elif mode == "balanced":
        dist_rules.append("LOW IMPORTANCE topics: at most 1 question if count allows")
    else:
        dist_rules.append("LOW IMPORTANCE topics: include for completeness")
    dist_guidance = "\n".join(f"  - {r}" for r in dist_rules)

    pdf_section = ""
    if pdf_text:
        pdf_section = (
            f"\n\nSYLLABUS / PAST PAPER CONTEXT (use to calibrate probabilities):\n"
            f"{pdf_text[:1500]}"
        )

    days_label = {
        "survival": "1–3 days remaining (CRITICAL URGENCY)",
        "balanced": "4–7 days remaining",
        "full": "8+ days remaining",
    }.get(mode, "unknown")

    question_style = _QUESTION_STYLES.get(mode, _QUESTION_STYLES["balanced"])
    solution_fmt = _SOLUTION_FORMATS.get(mode, _SOLUTION_FORMATS["balanced"])

    return f"""You are an expert AI Exam Question Generator for the subject: {subject}.

EXAM SITUATION: {days_label}
MODE: {mode.upper()}
MODE STRATEGY: {cfg["strategy"]}
COVERAGE FOCUS: {cfg["focus"]}
DIFFICULTY DISTRIBUTION TARGET: {cfg["difficulty_mix"]}

{question_style}

TOPICS WITH IMPORTANCE SCORES (1.0 = highest exam relevance):
{topic_lines}
{pdf_section}

TOPIC DISTRIBUTION RULES:
{dist_guidance}
  - No single topic should dominate more than 35% of all questions
  - Distribute questions intelligently — variety signals exam readiness

PROBABILITY CALIBRATION RULES:
  - probability = likelihood this exact question/concept appears on the real exam
  - Minimum probability: {cfg["prob_floor"]}
  - High-importance topics (weight ≥ 0.8): probability 0.80–0.97
  - Medium-importance topics (weight 0.4–0.79): probability 0.65–0.84
  - Low-importance topics (weight < 0.4): probability {cfg["prob_floor"]}–0.68
  - Use a realistic spread — e.g. 0.95, 0.91, 0.88, 0.84, 0.81, 0.77, 0.73...
  - Do NOT assign the same probability to more than 2 questions

{_QUESTION_FORMAT_PALETTE}

SOLUTION FORMAT:
  {solution_fmt}

TASK: Generate between {q_min} and {q_max} high-probability exam questions for {mode.upper()} mode.

REQUIRED OUTPUT FORMAT — return ONLY this JSON object, nothing else:
{{
  "questions": [
    {{
      "question": "<specific, exam-ready question — see format palette above>",
      "type": "<MCQ | coding | theory>",
      "difficulty": "<easy | medium | hard>",
      "probability": <float, {cfg["prob_floor"]} to 0.99>,
      "topic": "<must exactly match one of the topics listed above>",
      "solution": "<exam-oriented answer following the solution format above>"
    }}
  ]
}}

ABSOLUTE RULES — violating any of these invalidates your response:
1. Output ONLY the JSON object. No markdown. No ```json. No explanation text before or after.
2. Every question object must have ALL 6 fields: question, type, difficulty, probability, topic, solution.
3. "type" must be exactly one of: MCQ, coding, theory — no other values, no capitalization variants.
4. "difficulty" must be exactly one of: easy, medium, hard — no other values.
5. "probability" must be a JSON number (not a string), between {cfg["prob_floor"]} and 0.99.
6. "topic" must exactly match one of the topic names listed above.
7. Questions must be specific and testable — follow the format palette, not generic templates.
8. No two questions may test the same specific concept or have >70% wording overlap.
9. Solutions must be factually accurate, exam-oriented, and match the solution format above.
10. If a topic has a [MUST USE QUESTION TYPE: <type>] tag, questions for that topic MUST use that exact type.
11. CODING QUESTIONS: If "type" is "coding", the question MUST be formatted like a LeetCode, HackerRank, or GeeksforGeeks problem (with a clear scenario, input/output examples, and constraints). The "solution" field MUST include a clear code snippet enclosed in standard multiline markdown code blocks (e.g., \\n```python\\ndef foo():\\n    pass\\n```\\n) and a brief explanation. Use explicit \\n characters in the JSON string for proper line-by-line formatting.
12. MCQ QUESTIONS: If "type" is "MCQ", the "question" field MUST include exactly 4 distinct and plausible options (A, B, C, D) formatted on new lines using explicit \\n characters."""


def build_retry_prompt(subject: str, topics: list, mode: str) -> str:
    """Stripped-down, maximally strict prompt for the second attempt."""
    cfg = MODE_CONFIG.get(mode, MODE_CONFIG["balanced"])
    topic_str = ", ".join(topics[:8])
    first_topic = topics[0] if topics else "General"
    return f"""Generate {cfg["q_min"]} exam questions for subject "{subject}".
Topics available: {topic_str}

Return ONLY valid JSON — no other text whatsoever:
{{"questions":[{{"question":"Explain the main concepts of {first_topic} in {subject}.","type":"theory","difficulty":"medium","probability":0.78,"topic":"{first_topic}","solution":"Key principles and definitions relevant to {first_topic} in {subject} examinations."}}]}}

Each question needs all 6 fields:
- type: exactly MCQ, coding, or theory
- difficulty: exactly easy, medium, or hard
- probability: a number between 0.5 and 0.99
- topic: must be one of the topics listed above
- For "coding" types, "solution" MUST contain an actual code snippet enclosed in multiline markdown code blocks with explicit \\n for line breaks.
- For "MCQ" types, "question" MUST include exactly 4 options (A, B, C, D) separated by \\n.
Generate {cfg["q_min"]} diverse questions covering different topics from the list."""


# ─────────────────────────────────────────────
# Validation & Cleaning
# ─────────────────────────────────────────────

def _validate_and_clean_question(q: dict, valid_topics: list) -> Optional[dict]:
    if not isinstance(q, dict):
        return None

    required = ["question", "type", "difficulty", "probability", "topic", "solution"]
    for field in required:
        if field not in q:
            return None

    # question text
    question_text = str(q.get("question", "")).strip()
    if len(question_text) < 10:
        return None
    q["question"] = question_text

    # type — normalize with fuzzy matching
    raw_type = str(q.get("type", "")).strip().lower()
    
    if raw_type == "mcq":
        q["type"] = "MCQ"
    elif raw_type == "coding":
        q["type"] = "coding"
    elif raw_type == "theory":
        q["type"] = "theory"
    elif "mcq" in raw_type or "multiple" in raw_type or "choice" in raw_type:
        q["type"] = "MCQ"
    elif "theory" in raw_type or "theoret" in raw_type or "descript" in raw_type or "essay" in raw_type:
        q["type"] = "theory"
    elif "code" in raw_type or "coding" in raw_type or "program" in raw_type or "implement" in raw_type:
        q["type"] = "coding"
    else:
        q["type"] = "theory"

    # Heuristic: if it's tagged as coding but lacks a code block in the solution, it's actually a theory question
    if q["type"] == "coding" and "```" not in str(q.get("solution", "")):
        q["type"] = "theory"

    # difficulty — normalize
    raw_diff = str(q.get("difficulty", "")).strip().lower()
    if raw_diff in VALID_DIFFICULTIES:
        q["difficulty"] = raw_diff
    elif any(w in raw_diff for w in ("hard", "difficult", "advanced", "complex")):
        q["difficulty"] = "hard"
    elif any(w in raw_diff for w in ("easy", "simple", "basic", "beginner")):
        q["difficulty"] = "easy"
    else:
        q["difficulty"] = "medium"

    # probability — clamp to valid range
    try:
        prob = float(q["probability"])
        q["probability"] = round(max(0.50, min(0.99, prob)), 3)
    except (ValueError, TypeError):
        q["probability"] = 0.70

    # topic — fuzzy match to valid topics
    if valid_topics:
        raw_topic = str(q.get("topic", "")).strip()
        if raw_topic not in valid_topics:
            topic_lower = raw_topic.lower()
            matched = None
            for t in valid_topics:
                if t.lower() in topic_lower or topic_lower in t.lower():
                    matched = t
                    break
            q["topic"] = matched if matched else valid_topics[0]
    elif not q.get("topic"):
        return None

    # solution
    solution_text = str(q.get("solution", "")).strip()
    if len(solution_text) < 5:
        q["solution"] = f"Review core concepts of {q['topic']} for this topic."
    else:
        q["solution"] = solution_text

    return q


def _deduplicate_questions(questions: list) -> list:
    seen = []
    unique = []
    for q in questions:
        text = q["question"].lower().strip()
        is_dup = False
        for seen_text in seen:
            if text[:80] == seen_text[:80]:
                is_dup = True
                break
            words_new = set(text.split())
            words_seen = set(seen_text.split())
            if words_new and len(words_new & words_seen) / len(words_new) > 0.75:
                is_dup = True
                break
        if not is_dup:
            seen.append(text)
            unique.append(q)
    return unique


def _parse_groq_json(content: str, valid_topics: list) -> list:
    """
    Parse raw Groq response into a validated question list.

    Handles three structural variants the LLM may produce:
      1. Normal:  {"questions": [...]}
      2. Nested:  {"result": {"questions": [...]}} or similar wrapper
      3. Bare:    [{...}, {...}]  (json_object mode prevents this but guard anyway)
    """
    content = content.strip()

    # Strip markdown code fences if the LLM ignores the no-markdown instruction
    if content.startswith("```"):
        content = re.sub(r"^```[a-z]*\n?", "", content)
        content = re.sub(r"\n?```$", "", content)
        content = content.strip()

    # Parse JSON
    data = None
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group())
            except json.JSONDecodeError:
                logger.warning("[Groq] JSON parse failed even after regex extraction")
                return []
        else:
            logger.warning("[Groq] No JSON object found in response")
            return []

    # Resolve raw_list from whatever structure the LLM produced
    raw_list = []
    if isinstance(data, list):
        # Bare array: [{...}, {...}]
        raw_list = data
    elif isinstance(data, dict):
        if "questions" in data and isinstance(data["questions"], list):
            # Normal: {"questions": [...]}
            raw_list = data["questions"]
        else:
            # Search one level deeper for any key holding a list
            # Handles: {"result": {"questions": [...]}}, {"data": [...]}, etc.
            for v in data.values():
                if isinstance(v, list):
                    raw_list = v
                    break
                if isinstance(v, dict) and "questions" in v:
                    raw_list = v["questions"]
                    break

    if not raw_list:
        logger.warning("[Groq] Response parsed but questions list is empty or missing")
        return []

    cleaned = []
    for item in raw_list:
        validated = _validate_and_clean_question(item, valid_topics)
        if validated:
            cleaned.append(validated)

    result = _deduplicate_questions(cleaned)
    logger.debug("[Groq] Parsed %d/%d questions after validation+dedup", len(result), len(raw_list))
    return result


# ─────────────────────────────────────────────
# Fallback Questions (Deterministic)
# ─────────────────────────────────────────────

# 25 distinct theory-style templates — enough to generate unique questions even with
# a single topic in full mode (worst case: 25 questions, 1 topic).
# Iteration strategy: cycle templates as the outer loop, topics as the inner loop.
# This maximises uniqueness: e.g., with 2 topics we exhaust 2×25=50 unique pairs
# before any (topic, template) combination repeats.
_FALLBACK_TEMPLATES = [
    "Explain the key concepts and exam-relevant applications of {topic} in {subject}.",
    "What are the most frequently tested principles of {topic} in {subject} examinations?",
    "Compare the main approaches and methods used within {topic} for {subject}.",
    "Summarize the core rules, formulas, or definitions of {topic} relevant to {subject}.",
    "Describe a real-world application of {topic} that commonly appears in {subject} exams.",
    "What common misconceptions about {topic} must students avoid in {subject}?",
    "Explain why {topic} is important in {subject} and which aspects examiners focus on.",
    "List and briefly describe the key sub-topics within {topic} for {subject} revision.",
    "What are the advantages and limitations of different approaches to {topic} in {subject}?",
    "How does {topic} connect to other core areas in {subject}?",
    "What are the most challenging aspects of {topic} that students struggle with in {subject}?",
    "Describe the key stages or phases involved in {topic} as studied in {subject}.",
    "What prerequisites or foundational knowledge is needed to fully understand {topic} in {subject}?",
    "Identify and explain the key terminology associated with {topic} in {subject}.",
    "How would you approach a problem-solving question on {topic} in a {subject} exam?",
    "What formulas, algorithms, or frameworks are commonly used in {topic} for {subject}?",
    "What are typical exam question patterns for {topic} in {subject} and how should you tackle them?",
    "Explain the relationship between {topic} and practical {subject} applications.",
    "What are the boundary conditions or edge cases of {topic} that examiners test in {subject}?",
    "Describe best practices and common anti-patterns related to {topic} in {subject}.",
    "What worked examples best illustrate the core principles of {topic} for {subject}?",
    "How is {topic} tested differently at easy versus hard difficulty levels in {subject} exams?",
    "What is the minimum viable understanding of {topic} needed to answer exam questions in {subject}?",
    "Outline a step-by-step strategy for answering questions about {topic} in {subject}.",
    "What makes {topic} challenging, and how can a student systematically master it for {subject}?",
]

_FALLBACK_SOLUTIONS = [
    "Review: core definitions, key principles, practical applications, and common exam patterns for {topic} in {subject}.",
    "Focus on concepts appearing most in past papers. Ensure you can recall definitions and apply them correctly.",
    "Understand the trade-offs, similarities, and differences between the main approaches — comparison questions are common.",
    "Memorize key formulas and definitions. Practice applying them to standard exam-style problems.",
    "Be able to describe at least one concrete real-world example and explain why it demonstrates the concept.",
    "Avoid common errors: confusing similar terms, misapplying formulas, or omitting edge-case considerations.",
    "Know both the theoretical basis and practical testing context. Examiners reward conceptual understanding.",
    "Build a structured outline of sub-topics so you can answer 'list and explain' questions completely.",
    "Weigh the trade-offs of each approach. Examiners often ask when to use one over another.",
    "Cross-topic questions are high-value. Be able to explain how {topic} depends on or enables other areas.",
    "Identify common student mistakes and practice the specific steps that resolve them.",
    "Map out the key stages with brief notes on what happens at each — flowchart-style recall works well.",
    "List the foundational concepts explicitly. Gaps in prerequisites cause errors on application questions.",
    "Create a glossary of key terms. Precise use of terminology is rewarded in {subject} exams.",
    "Practise a structured approach: understand, plan, execute, verify. Apply this to typical exam problems.",
    "Compile and drill the key formulas until they are automatic. Speed on recall wins time for reasoning.",
    "Categorise question types (definition, application, comparison) and prepare a template response for each.",
    "Connect theory to application with a specific case study. Examiners value students who bridge both.",
    "Boundary conditions reveal deep understanding. Practise identifying what happens at limits or extremes.",
    "Contrast correct practice against common mistakes. Showing you know what NOT to do is also valued.",
    "Worked examples build intuition. Solve at least 3 representative problems from scratch.",
    "Difficulty scaling usually involves more constraints or less information. Practise both variants.",
    "Distil {topic} to 5 key points you can recall in under 60 seconds — ideal for time-pressured exams.",
    "A structured answer plan (intro, key points, conclusion) consistently earns full marks in {subject}.",
    "Systematic mastery: understand → summarise → apply → self-test. Repeat until recall is effortless.",
]


def _build_fallback_questions(subject: str, topics: list, mode: str) -> list:
    """
    Always-safe deterministic fallback.

    Uniqueness guarantee: iterates (template, topic) pairs in template-major order.
    With T templates and N topics, the first T×N questions are all unique. Since
    T=25 and q_max=25, even a single-topic request in full mode produces 25 unique
    questions (one per template).

    All questions use type='theory' to match their descriptive phrasing.
    """
    if not topics:
        topics = [subject]

    cfg = MODE_CONFIG.get(mode, MODE_CONFIG["balanced"])
    count = cfg["q_min"]
    prob_floor = cfg["prob_floor"]

    diff_rotation = ["medium", "easy", "hard", "medium", "hard", "medium", "easy", "hard",
                     "medium", "hard", "easy", "medium", "hard", "easy", "medium",
                     "hard", "medium", "easy", "hard", "medium", "easy", "hard",
                     "medium", "easy", "hard"]
    prob_start = max(prob_floor, 0.82)

    n_templates = len(_FALLBACK_TEMPLATES)
    n_topics = len(topics)

    # Build ordered (template_idx, topic) pairs in template-major order so that
    # each template appears with each topic before any template repeats.
    ordered_pairs = [
        (t_idx, topics[topic_idx % n_topics])
        for t_idx in range(n_templates)
        for topic_idx in range(n_topics)
    ]

    fallbacks = []
    for i in range(count):
        pair_idx = i % len(ordered_pairs)
        t_idx, topic = ordered_pairs[pair_idx]
        question_text = _FALLBACK_TEMPLATES[t_idx].format(topic=topic, subject=subject)
        solution_text = _FALLBACK_SOLUTIONS[t_idx].format(topic=topic, subject=subject)
        probability = round(max(prob_floor, prob_start - i * 0.02), 3)

        fallbacks.append({
            "question": question_text,
            "type": "theory",
            "difficulty": diff_rotation[i % len(diff_rotation)],
            "probability": probability,
            "topic": topic,
            "solution": solution_text,
        })

    return fallbacks


# ─────────────────────────────────────────────
# Core Groq API Call
# ─────────────────────────────────────────────

def _call_groq_questions(prompt: str, valid_topics: list, max_tokens: int = 4096) -> list:
    """
    Single Groq API call with timing instrumentation.
    Returns validated question list or [] on any failure.
    """
    t0 = time.time()
    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an exam question generator. "
                        "Output ONLY valid JSON. No markdown, no code fences, "
                        "no explanations, no text outside the JSON object."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        elapsed = time.time() - t0
        usage = completion.usage
        if usage:
            logger.info(
                "[Groq] Response in %.2fs | prompt=%d tokens | completion=%d tokens | total=%d",
                elapsed,
                usage.prompt_tokens,
                usage.completion_tokens,
                usage.total_tokens,
            )
        else:
            logger.info("[Groq] Response in %.2fs (no usage data)", elapsed)

        content = completion.choices[0].message.content
        return _parse_groq_json(content, valid_topics)
    except Exception as e:
        elapsed = time.time() - t0
        logger.error("[Groq] API call failed after %.2fs: %s", elapsed, e)
        return []


# ─────────────────────────────────────────────
# Public: Generate Questions (retry + fallback)
# ─────────────────────────────────────────────

def generate_questions(
    subject: str,
    topics: list,
    mode: str,
    weights: dict = None,
    pdf_text: str = None,
    topic_insights: dict = None,
) -> list:
    """
    Generate exam questions with retry logic and a guaranteed non-empty result.

    Attempt 1: Full Master Prompt V2 with weights and PDF context.
    Attempt 2: Simplified retry prompt (0.5s delay) if attempt 1 is below min count.
    Top-up:    Pad remaining slots with deterministic fallback questions.
    Hard fallback: If both API attempts return nothing, use full deterministic set.
    """
    if not client:
        logger.warning("[Groq] No API client configured — using deterministic fallback")
        return _build_fallback_questions(subject, topics, mode)

    cfg = MODE_CONFIG.get(mode, MODE_CONFIG["balanced"])
    min_count = cfg["q_min"]
    max_tok = cfg["max_tokens"]

    # Attempt 1 — full prompt
    prompt = build_prompt(subject, topics, mode, weights, pdf_text, topic_insights)
    logger.info("[Groq] Attempt 1 | mode=%s | max_tokens=%d", mode, max_tok)
    questions = _call_groq_questions(prompt, topics, max_tokens=max_tok)

    if len(questions) >= min_count:
        logger.info("[Groq] Attempt 1 success: %d/%d questions", len(questions), min_count)
        questions = _apply_mode_prob_floor(questions, cfg["prob_floor"])
        return _normalize_probability_spread(questions, cfg["prob_floor"])

    # Attempt 2 — simplified retry prompt with a short delay
    logger.warning(
        "[Groq] Attempt 1 returned %d/%d questions — waiting 0.5s then retrying",
        len(questions), min_count,
    )
    time.sleep(0.5)

    retry_prompt = build_retry_prompt(subject, topics, mode)
    retry_questions = _call_groq_questions(retry_prompt, topics, max_tokens=max_tok)

    if retry_questions:
        merged = _deduplicate_questions(questions + retry_questions)
        logger.info("[Groq] Attempt 2 merged: %d questions", len(merged))
        questions = merged
    elif questions:
        logger.warning("[Groq] Attempt 2 returned nothing — using attempt 1 partial result")
    else:
        logger.error("[Groq] Both attempts returned nothing — using deterministic fallback")
        return _build_fallback_questions(subject, topics, mode)

    # Top up with fallback questions if still below minimum
    if len(questions) < min_count:
        needed = min_count - len(questions)
        logger.warning("[Groq] Padding %d slots with deterministic fallback questions", needed)
        topics_covered = {q["topic"] for q in questions}
        # Prefer topics not yet covered for padding
        topics_for_pad = [t for t in topics if t not in topics_covered] or topics
        pad_questions = _build_fallback_questions(subject, topics_for_pad, mode)
        # Only add as many as needed
        questions = questions + pad_questions[:needed]

    questions = _apply_mode_prob_floor(questions, cfg["prob_floor"])
    return _normalize_probability_spread(questions, cfg["prob_floor"])


def _apply_mode_prob_floor(questions: list, floor: float) -> list:
    """Enforce mode-specific minimum probability — LLM sometimes goes below the floor."""
    for q in questions:
        try:
            if float(q.get("probability", 0)) < floor:
                q["probability"] = floor
        except (ValueError, TypeError):
            q["probability"] = floor
    return questions


# ─────────────────────────────────────────────
# Post-Processing & Priority Scoring
# ─────────────────────────────────────────────

def parse_questions_from_response(
    raw_questions: list, weights: dict, mode: str = "balanced"
) -> list:
    """Apply mode-aware priority scoring and sort by priority then probability."""
    parsed = []
    for q in raw_questions:
        topic = q.get("topic", "")
        weight = weights.get(topic, 0.5)
        prob = float(q.get("probability", 0.5))
        score = compute_priority_score(weight, prob)
        priority = assign_priority(score, mode)   # mode-specific thresholds

        q["priority"] = priority
        diff = str(q.get("difficulty", "medium")).lower()
        q["difficulty"] = diff if diff in VALID_DIFFICULTIES else "medium"
        parsed.append(q)

    priority_order = {"must": 0, "should": 1, "optional": 2}
    parsed.sort(key=lambda x: (priority_order.get(x["priority"], 3), -x.get("probability", 0)))
    return parsed


def _normalize_probability_spread(questions: list, prob_floor: float) -> list:
    """
    Ensure no probability value appears 4+ times in a row.
    Applies tiny sequential offsets to any excess duplicates so the
    final output shows a realistic spread rather than blocks of 0.80, 0.80, 0.80...
    """
    running: dict = {}
    for q in questions:
        try:
            p = round(float(q.get("probability", 0.75)), 2)
        except (ValueError, TypeError):
            p = 0.75
        running[p] = running.get(p, 0) + 1
        if running[p] >= 4:
            # 4th duplicate → -0.01, 5th → -0.02, ...
            offset = -(running[p] - 3) * 0.01
            q["probability"] = round(max(prob_floor, min(0.99, p + offset)), 3)
    return questions


# ─────────────────────────────────────────────
# Chatbot System Prompt
# ─────────────────────────────────────────────

_CHATBOT_BASE = """You are Prepzo, an expert AI exam preparation coach. You help students prepare efficiently for their exams.

Your teaching style:
- Be concise and exam-focused — students have limited time
- Use bullet points for multi-part explanations
- Always relate your answer to what will likely appear on the exam
- Offer mnemonics, shortcuts, or memory aids when helpful
- Be encouraging but efficient

You can assist with:
1. Explaining a question or concept in simple terms
2. Simplifying a difficult topic
3. Generating similar practice questions
4. Quick revision summaries for a topic
5. Exam strategy and time management advice

After any explanation, end with a single line: "Exam tip: [one actionable, specific tip]"
"""

_MODE_COACHING = {
    "survival": (
        "URGENCY: Student has only 1-3 days left. Be EXTREMELY concise. "
        "Focus only on highest-yield points. Skip deep dives — give the minimum "
        "viable understanding to score marks. Every second counts."
    ),
    "balanced": (
        "Student has 4-7 days. Provide clear, structured explanations. "
        "Balance depth with efficiency. Cover both understanding and application."
    ),
    "full": (
        "Student has 8+ days. Can handle detailed explanations. "
        "Encourage conceptual depth, provide examples, explore edge cases when relevant."
    ),
}


def build_chatbot_system_prompt(
    subject: str = None,
    mode: str = None,
    topics: list = None,
    questions_context: list = None,
    exam_date: str = None,
    study_schedule: list = None,
    topic_insights: dict = None,
    pattern_analysis: dict = None,
    weak_topics: list = None,
) -> str:
    """
    Assemble a rich, context-aware system prompt for the chatbot.

    Includes:
    - Subject, date, mode + coaching tone
    - Generated questions grouped by priority (must / should / optional)
    - ML Naive Bayes question-type predictions per topic
    - First 5 days of the SM-2 study schedule
    - Past-paper pattern analysis (repeating patterns, category breakdown, correlations)
    - Weak topics identified from low-probability questions
    """
    parts = [_CHATBOT_BASE]

    if subject:
        parts.append(f"\nSUBJECT: {subject}")
    if exam_date:
        parts.append(f"EXAM DATE: {exam_date}")
    if mode:
        coaching = _MODE_COACHING.get(mode, "")
        parts.append(f"STUDY MODE: {mode.upper()} — {coaching}")

    # Group questions by priority so the bot can answer "what should I revise first?"
    if questions_context:
        must = [q for q in questions_context if q.get("priority") == "must"]
        should = [q for q in questions_context if q.get("priority") == "should"]
        optional = [q for q in questions_context if q.get("priority") == "optional"]

        def _fmt_q(i, q):
            topic = q.get("topic", "")
            question = q.get("question", "")
            qtype = q.get("type", "theory")
            difficulty = q.get("difficulty", "medium")
            try:
                prob_label = f"{float(q.get('probability', 0)):.0%}"
            except (ValueError, TypeError):
                prob_label = "N/A"
            return f"  Q{i}. [{topic}] {question} (type: {qtype}, difficulty: {difficulty}, probability: {prob_label})"

        parts.append("\nGENERATED EXAM QUESTIONS BY PRIORITY:")
        counter = 1
        if must:
            parts.append("  🔴 MUST DO — memorise these, highest exam likelihood:")
            for q in must[:8]:
                parts.append(_fmt_q(counter, q))
                counter += 1
        if should:
            parts.append("  🟡 SHOULD DO — important, good ROI:")
            for q in should[:6]:
                parts.append(_fmt_q(counter, q))
                counter += 1
        if optional:
            parts.append("  ⚪ OPTIONAL — if time allows:")
            for q in optional[:4]:
                parts.append(_fmt_q(counter, q))
                counter += 1

        if topics:
            parts.append(f"\nFOCUS TOPICS: {', '.join(topics)}")

    elif topics:
        parts.append(f"\nTOPICS IN STUDY PLAN: {', '.join(topics)}")

    # ML Naive Bayes question type predictions
    if topic_insights:
        parts.append("\nML QUESTION TYPE PREDICTIONS (Naive Bayes — cite when asked about topic format):")
        for topic, insight in list(topic_insights.items())[:10]:
            if isinstance(insight, dict):
                predicted = insight.get("predicted_type", "theory")
                conf = insight.get("confidence", {})
                top_conf = max(conf.values()) if conf else None
                conf_str = f" ({top_conf:.0%} confidence)" if top_conf else ""
                parts.append(f"  - {topic}: likely {predicted}{conf_str}")

    # Study schedule summary (first 5 days to avoid token bloat)
    if study_schedule:
        parts.append("\nSTUDY SCHEDULE (cite when asked 'when should I study X' or 'how much time do I have'):")
        for day in study_schedule[:5]:
            label = day.get("label", f"Day {day.get('day', '?')}")
            date = day.get("date", "")
            total_min = day.get("totalMinutes", 0)
            day_topics = day.get("topics", [])
            topic_summary = ", ".join(
                f"{t.get('name', '')} ({t.get('action', 'study')} {t.get('duration_minutes', 0)}min)"
                for t in day_topics[:4]
            )
            parts.append(f"  {label} ({date}): {topic_summary} — {total_min}min total")

    # Past-paper pattern analysis (cite when asked about repeating topics or exam trends)
    if pattern_analysis and pattern_analysis.get("totalQuestionsAnalyzed", 0) > 0:
        total_analysed = pattern_analysis["totalQuestionsAnalyzed"]
        parts.append(f"\nPAST PAPER PATTERN ANALYSIS ({total_analysed} questions analysed from uploaded PDF):")

        # Category breakdown — e.g. "Implementation/Coding: 35%, Definition/Recall: 25%"
        cat_breakdown = pattern_analysis.get("categoryBreakdown", {})
        if cat_breakdown:
            parts.append("  QUESTION TYPE DISTRIBUTION:")
            sorted_cats = sorted(cat_breakdown.items(), key=lambda x: -x[1])
            for cat, pct in sorted_cats[:6]:
                parts.append(f"    - {cat}: {pct}%")

        # Topic × question type correlations — e.g. "Normalization → MCQ (4x)"
        topic_corr = pattern_analysis.get("topicCorrelation", {})
        if topic_corr:
            parts.append("  TOPIC × QUESTION TYPE CORRELATIONS:")
            for topic, data in list(topic_corr.items())[:8]:
                if isinstance(data, dict):
                    common_type = data.get("most_common_type", "theory")
                    freq = data.get("frequency", 0)
                    parts.append(f"    - {topic} → usually {common_type} ({freq}x)")

        # Top repeating patterns — e.g. "Explain normalization forms (appeared 4x, 85% likely)"
        patterns = pattern_analysis.get("patterns", [])
        if patterns:
            parts.append("  TOP REPEATING QUESTION PATTERNS:")
            for p in patterns[:5]:
                pattern_text = p.get("pattern", "")
                category = p.get("category", "General")
                freq = p.get("frequency", 0)
                try:
                    prob = f"{float(p.get('probability', 0)):.0%}"
                except (ValueError, TypeError):
                    prob = "N/A"
                parts.append(f"    - [{category}] {pattern_text} (appeared {freq}x, {prob} likely)")

    # Weak topics — topics where the student needs extra focus
    if weak_topics:
        parts.append(f"\nWEAK TOPICS (lowest exam probability — student should prioritise these):")
        parts.append(f"  {', '.join(weak_topics)}")

    # Conversational intelligence routing — tells the AI exactly what context to use
    parts.append(
        "\n── RESPONSE ROUTING RULES ──"
        "\nWhen a student asks 'what should I revise first?' → reference MUST DO questions, ordered by probability."
        "\nWhen asked 'which topic has highest probability?' → find the question with highest probability value and cite it."
        "\nWhen asked about question format for a topic → cite the ML Naive Bayes prediction."
        "\nWhen asked about time/schedule → reference the study schedule with specific days and durations."
        "\nWhen asked 'which topics repeat the most?' → cite the PAST PAPER PATTERN ANALYSIS section."
        "\nWhen asked about coding/theory/MCQ distribution → cite the QUESTION TYPE DISTRIBUTION from pattern analysis."
        "\nWhen asked 'what are my weak topics?' → cite the WEAK TOPICS list and suggest specific revision actions."
        "\nWhen asked for practice questions → generate questions similar to MUST DO items, matching the topic's predicted type."
        "\nAlways ground your answers in the actual data above. Never make up probabilities or schedules."
    )

    return "\n".join(parts)


# ─────────────────────────────────────────────
# Public: Chatbot
# ─────────────────────────────────────────────

def chat_with_groq(
    messages: list,
    subject: str = None,
    mode: str = None,
    topics: list = None,
    questions_context: list = None,
    exam_date: str = None,
    study_schedule: list = None,
    topic_insights: dict = None,
    pattern_analysis: dict = None,
    weak_topics: list = None,
) -> str:
    """
    Context-aware chatbot with token-safe message capping.

    Injects full exam context (subject, mode, topics, generated questions,
    ML predictions, study schedule, pattern analysis, weak topics) into
    the system prompt so the bot can explain specific questions, cite ML
    predictions, reference the schedule, and identify repeating patterns.
    """
    if not client:
        return (
            "I'm currently unavailable — the Groq API key is not configured. "
            "Please add your GROQ_API_KEY to the .env file to enable the chatbot."
        )

    if len(messages) > _MAX_CHAT_HISTORY:
        logger.debug(
            "[Groq] Chatbot: trimming messages from %d to %d",
            len(messages), _MAX_CHAT_HISTORY,
        )
        messages = messages[-_MAX_CHAT_HISTORY:]

    system_content = build_chatbot_system_prompt(
        subject=subject,
        mode=mode,
        topics=topics,
        questions_context=questions_context,
        exam_date=exam_date,
        study_schedule=study_schedule,
        topic_insights=topic_insights,
        pattern_analysis=pattern_analysis,
        weak_topics=weak_topics,
    )

    full_messages = [{"role": "system", "content": system_content}] + messages

    t0 = time.time()
    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=full_messages,
            temperature=0.5,
            max_tokens=1024,
        )
        elapsed = time.time() - t0
        logger.info("[Groq] Chat response in %.2fs", elapsed)
        return completion.choices[0].message.content
    except Exception as e:
        elapsed = time.time() - t0
        logger.error("[Groq] Chat error after %.2fs: %s", elapsed, e)
        return (
            "I encountered an issue processing your request. "
            "Please try again in a moment."
        )

