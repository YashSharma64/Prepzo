"""
ML Model 4 — Spaced Repetition Scheduler (SM-2 Algorithm)

Generates a scientifically-backed day-by-day study timetable using the
SuperMemo SM-2 spaced repetition algorithm, adapted for fixed exam deadlines.

The SM-2 algorithm calculates optimal review intervals based on memory
decay curves. Combined with topic importance weights, it ensures students
review high-priority material more frequently while still covering
everything before the exam.

Schedule Variety:
- Topics are staggered across days so each day has a different mix.
- SM-2 intervals grow as 1 → 2 → 4 → 7 → 13+ days apart.
- Practice sessions are interleaved from the 3rd day onwards.
- A cap on reviews per day prevents "wall of reviews" days.
"""

import logging
import math
from datetime import datetime, timedelta

logger = logging.getLogger("prepzo.spaced_repetition")


# ─────────────────────────────────────────────
# SM-2 Core Algorithm
# ─────────────────────────────────────────────

def _sm2_interval(repetition: int, ease_factor: float) -> int:
    """
    Calculate the next review interval using SM-2.

    repetition: number of successful reviews (0 = first time after learning)
    ease_factor: difficulty multiplier (1.3 minimum, 2.5 default)

    Returns: days until next review

    Intervals (with default ease 2.0):
        rep 0 → 1 day   (next day quick check)
        rep 1 → 2 days
        rep 2 → 4 days
        rep 3 → 7 days   (about a week)
        rep 4+→ grows with ease factor
    """
    if repetition == 0:
        return 1   # Quick next-day reinforcement
    elif repetition == 1:
        return 2   # Two days later
    elif repetition == 2:
        return 4   # Four days later
    else:
        prev = _sm2_interval(repetition - 1, ease_factor)
        return max(3, round(prev * ease_factor))


# ─────────────────────────────────────────────
# Mode Configurations
# ─────────────────────────────────────────────

_MODE_CONFIG = {
    "survival": {
        "hours_per_day": 8,
        "learn_minutes": 30,
        "review_minutes": 15,
        "practice_minutes": 20,
        # Survival: introduce topics fast but NOT all on day 1
        "max_new_per_day_cap": None,        # Calculated dynamically
        "max_reviews_per_day_cap": 8,       # Cap reviews to leave room for new topics
    },
    "balanced": {
        "hours_per_day": 5,
        "learn_minutes": 45,
        "review_minutes": 20,
        "practice_minutes": 30,
        "max_new_per_day_cap": None,
        "max_reviews_per_day_cap": 6,
    },
    "full": {
        "hours_per_day": 4,
        "learn_minutes": 60,
        "review_minutes": 25,
        "practice_minutes": 40,
        "max_new_per_day_cap": None,
        "max_reviews_per_day_cap": 5,
    },
}

_TIPS = {
    "survival": [
        "🔥 Focus on must-do topics only. Skip optional material.",
        "⚡ Use active recall: close notes and test yourself.",
        "🎯 Practice writing answers under time pressure.",
    ],
    "balanced": [
        "📝 Start with the hardest topics while your mind is fresh.",
        "🔄 Review yesterday's topics before starting new ones.",
        "💡 Create mind maps to connect related concepts.",
        "✍️ Practice writing full exam-style answers.",
        "🧠 Teach a concept out loud to test your understanding.",
    ],
    "full": [
        "📚 Deep-dive into fundamentals before advanced topics.",
        "🔄 Space your reviews — don't cram everything in one day.",
        "🎯 Practice past paper questions under timed conditions.",
        "💡 Build connections between topics for deeper understanding.",
        "📝 Write summary notes in your own words.",
        "🧪 Try solving problems without looking at solutions first.",
        "🔍 Focus on edge cases and common exam traps.",
    ],
}


def _calculate_new_per_day(n_topics: int, days_left: int, mode: str) -> int:
    """
    Spread topic introduction across available days to avoid dumping
    everything on Day 1. Reserves the last 20% of days for pure review/practice.
    """
    if days_left <= 2:
        # Very short deadline: split evenly
        return max(1, math.ceil(n_topics / days_left))

    # Reserve last ~20% of days for review-only / practice
    learning_days = max(1, int(days_left * 0.75))

    per_day = math.ceil(n_topics / learning_days)

    # Mode adjustments
    if mode == "survival":
        # Faster but not all at once
        per_day = max(per_day, math.ceil(n_topics / max(1, days_left // 2)))
    elif mode == "full":
        # Slower, more thorough
        per_day = max(1, min(per_day, 3))

    return max(1, min(per_day, n_topics))


# ─────────────────────────────────────────────
# Public: Generate Study Schedule
# ─────────────────────────────────────────────

def generate_study_schedule(
    topics: list,
    exam_date: str,
    mode: str,
    weights: dict = None,
) -> list:
    """
    Generate a day-by-day study schedule using SM-2 spaced repetition.

    Args:
        topics: List of topic strings
        exam_date: ISO date string (YYYY-MM-DD)
        mode: survival | balanced | full
        weights: Topic importance weights from TF-IDF

    Returns:
        list of day objects:
        [
            {
                "day": 1,
                "date": "2026-05-10",
                "label": "Day 1",
                "topics": [
                    {
                        "name": "Arrays",
                        "action": "learn",    # learn | review | practice
                        "duration_minutes": 45,
                        "priority": "high"
                    }
                ],
                "totalMinutes": 120,
                "tip": "Focus on understanding core concepts first."
            }
        ]
    """
    try:
        exam_dt = datetime.strptime(exam_date, "%Y-%m-%d")
    except ValueError:
        return []

    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    days_left = max(1, (exam_dt - today).days)

    if not topics:
        return []

    cfg = _MODE_CONFIG.get(mode, _MODE_CONFIG["balanced"])
    max_minutes = cfg["hours_per_day"] * 60
    max_reviews_per_day = cfg["max_reviews_per_day_cap"]
    max_new_per_day = _calculate_new_per_day(len(topics), days_left, mode)
    mode_tips = _TIPS.get(mode, _TIPS["balanced"])

    # Sort topics by importance (highest first)
    if weights:
        sorted_topics = sorted(topics, key=lambda t: -weights.get(t, 0.5))
    else:
        sorted_topics = list(topics)

    # Assign ease factors: high importance → lower ease → more frequent review
    ease_factors = {}
    for t in sorted_topics:
        w = weights.get(t, 0.5) if weights else 0.5
        ease_factors[t] = max(1.3, 2.5 - (w * 1.2))

    # Track each topic's learning state
    topic_state = {
        t: {
            "learned": False,
            "repetitions": 0,
            "next_review": None,
            "ease": ease_factors.get(t, 2.0),
        }
        for t in sorted_topics
    }

    topics_queue = list(sorted_topics)  # Topics not yet introduced
    schedule = []

    for day_num in range(1, days_left + 1):
        current_date = today + timedelta(days=day_num)
        is_last_day = day_num == days_left
        day_topics = []
        remaining = max_minutes
        review_count = 0

        # ── Phase 1: Scheduled SM-2 Reviews ──
        # Collect all due reviews, sort by priority (high-weight first)
        due_reviews = []
        for t in sorted_topics:
            state = topic_state[t]
            if not state["learned"] or not state["next_review"]:
                continue
            if state["next_review"] > current_date:
                continue
            w = weights.get(t, 0.5) if weights else 0.5
            due_reviews.append((t, w))

        # Sort by weight descending so high-priority reviews come first
        due_reviews.sort(key=lambda x: -x[1])

        for t, w in due_reviews:
            if review_count >= max_reviews_per_day:
                # Defer: push review to tomorrow
                topic_state[t]["next_review"] = current_date + timedelta(days=1)
                continue

            state = topic_state[t]
            action = "review" if state["repetitions"] < 3 else "practice"
            mins = cfg["review_minutes"] if action == "review" else cfg["practice_minutes"]

            if remaining < mins:
                # Not enough time today, defer
                state["next_review"] = current_date + timedelta(days=1)
                continue

            priority = "high" if w >= 0.7 else "medium" if w >= 0.4 else "low"

            day_topics.append(
                {
                    "name": t,
                    "action": action,
                    "duration_minutes": mins,
                    "priority": priority,
                }
            )
            remaining -= mins
            review_count += 1

            # Advance SM-2 state
            state["repetitions"] += 1
            interval = _sm2_interval(state["repetitions"], state["ease"])
            # Clamp interval so we don't schedule past the exam
            max_interval = max(1, days_left - day_num)
            clamped = min(interval, max_interval)
            state["next_review"] = current_date + timedelta(days=clamped)

        # ── Phase 2: Introduce New Topics ──
        # Don't introduce new topics on the last day (pure review/practice)
        if not is_last_day and topics_queue:
            new_count = 0
            while (
                topics_queue
                and new_count < max_new_per_day
                and remaining >= cfg["learn_minutes"]
            ):
                t = topics_queue.pop(0)
                w = weights.get(t, 0.5) if weights else 0.5
                priority = "high" if w >= 0.7 else "medium" if w >= 0.4 else "low"

                day_topics.append(
                    {
                        "name": t,
                        "action": "learn",
                        "duration_minutes": cfg["learn_minutes"],
                        "priority": priority,
                    }
                )
                remaining -= cfg["learn_minutes"]

                topic_state[t]["learned"] = True
                topic_state[t]["repetitions"] = 0
                # First review in 1 day (next-day reinforcement)
                topic_state[t]["next_review"] = current_date + timedelta(days=1)
                new_count += 1

        # ── Phase 3: Fill remaining time with practice (from day 3+) ──
        if day_num >= 3 and remaining >= cfg["practice_minutes"]:
            # Pick learned topics that aren't already on today's list for practice
            today_names = {d["name"] for d in day_topics}
            practice_candidates = [
                t for t in sorted_topics
                if topic_state[t]["learned"]
                and t not in today_names
                and topic_state[t]["repetitions"] >= 1
            ]
            # Sort by weight (prioritize high-importance for practice)
            if weights:
                practice_candidates.sort(key=lambda t: -weights.get(t, 0.5))

            for t in practice_candidates:
                if remaining < cfg["practice_minutes"]:
                    break
                w = weights.get(t, 0.5) if weights else 0.5
                priority = "high" if w >= 0.7 else "medium" if w >= 0.4 else "low"
                day_topics.append(
                    {
                        "name": t,
                        "action": "practice",
                        "duration_minutes": cfg["practice_minutes"],
                        "priority": priority,
                    }
                )
                remaining -= cfg["practice_minutes"]

        # ── Last Day: Everything becomes practice ──
        if is_last_day:
            for dt in day_topics:
                dt["action"] = "practice"

        if day_topics:
            tip = mode_tips[(day_num - 1) % len(mode_tips)]
            if is_last_day:
                tip = "🎯 Final day! Quick review of must-do topics, then rest well. Trust your preparation."

            schedule.append(
                {
                    "day": day_num,
                    "date": current_date.strftime("%Y-%m-%d"),
                    "label": f"Day {day_num}"
                    + (" (Exam Day)" if is_last_day else ""),
                    "topics": day_topics,
                    "totalMinutes": sum(d["duration_minutes"] for d in day_topics),
                    "tip": tip,
                }
            )

    logger.info(
        "[SM-2] Generated %d-day schedule for %d topics (mode=%s, days_left=%d)",
        len(schedule),
        len(sorted_topics),
        mode,
        days_left,
    )
    return schedule
