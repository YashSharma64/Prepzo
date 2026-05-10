"""
ML Service — TF-IDF based Topic Importance Scoring + Naive Bayes Question Type Prediction

Uses scikit-learn's TfidfVectorizer to analyze past question papers
or syllabus text and compute data-driven topic weights.

Uses Naive Bayes (MultinomialNB) to predict whether a topic will
likely appear as MCQ, Coding, or Theory based on keyword patterns.
"""

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
import numpy as np


# ─────────────────────────────────────────────
# 1. TF-IDF Topic Importance Scoring
# ─────────────────────────────────────────────

def compute_topic_weights_tfidf(topics: list, pdf_text: str) -> dict:
    """
    Uses TF-IDF to score how important each topic is based on 
    how frequently it appears in the uploaded PDF text.

    Args:
        topics: List of topic strings (e.g., ["Observer Pattern", "SOLID"])
        pdf_text: Raw text extracted from syllabus/past papers

    Returns:
        dict: {topic: weight} where weight is 0.0–1.0 (normalized)
    """
    if not topics or not pdf_text:
        return {}

    # Build a corpus: each topic is a "document", and the PDF is the reference
    corpus = [pdf_text] + topics

    try:
        vectorizer = TfidfVectorizer(
            stop_words="english",
            lowercase=True,
            max_features=500
        )
        tfidf_matrix = vectorizer.fit_transform(corpus)

        # The first row is the PDF text vector
        pdf_vector = tfidf_matrix[0]

        # Compute cosine similarity of each topic against the PDF
        from sklearn.metrics.pairwise import cosine_similarity

        scores = {}
        for i, topic in enumerate(topics):
            topic_vector = tfidf_matrix[i + 1]  # +1 because PDF is index 0
            similarity = cosine_similarity(pdf_vector, topic_vector)[0][0]
            scores[topic] = float(similarity)

        # Normalize scores to 0.0–1.0 range
        if scores:
            max_score = max(scores.values()) if max(scores.values()) > 0 else 1.0
            scores = {k: round(v / max_score, 3) for k, v in scores.items()}

        return scores

    except Exception as e:
        print(f"ML Service Error: {e}")
        return {}


def merge_weights(rule_weights: dict, ml_weights: dict, ml_ratio: float = 0.5) -> dict:
    """
    Merges rule-based Pareto weights with ML-derived TF-IDF weights.

    Args:
        rule_weights: From deadline_service.assign_topic_weights()
        ml_weights: From compute_topic_weights_tfidf()
        ml_ratio: How much to trust the ML model (0.0–1.0)
                  0.0 = fully rule-based, 1.0 = fully ML

    Returns:
        dict: {topic: blended_weight}
    """
    merged = {}
    rule_ratio = 1.0 - ml_ratio

    all_topics = set(list(rule_weights.keys()) + list(ml_weights.keys()))

    for topic in all_topics:
        rule_w = rule_weights.get(topic, 0.5)
        ml_w = ml_weights.get(topic, 0.5)
        merged[topic] = round((rule_w * rule_ratio) + (ml_w * ml_ratio), 3)

    return merged


# ─────────────────────────────────────────────
# 2. Naive Bayes Question Type Predictor
# ─────────────────────────────────────────────

# Training data: keyword patterns mapped to question types
TRAINING_DATA = [
    # Theory patterns
    ("define explain describe discuss elaborate concept meaning overview introduction", "theory"),
    ("what is difference between compare contrast advantages disadvantages", "theory"),
    ("principles characteristics features properties types classification", "theory"),
    ("architecture diagram flow lifecycle phases stages", "theory"),
    ("list enumerate state mention name identify", "theory"),
    ("role importance significance purpose need why", "theory"),
    ("theory fundamentals basics concepts overview summary", "theory"),
    ("advantages limitations drawbacks benefits merits demerits", "theory"),
    ("history evolution origins timeline background context impact", "theory"),
    ("causes effects consequences evaluate assess critique", "theory"),
    ("framework protocol standard model process methodology", "theory"),

    # Coding patterns
    ("implement write code program function algorithm", "coding"),
    ("output debug trace dry run execute compile", "coding"),
    ("class object method constructor inheritance polymorphism", "coding"),
    ("array linked list stack queue tree graph sort search", "coding"),
    ("syntax example snippet logic pseudocode flowchart", "coding"),
    ("design pattern implementation observer strategy factory singleton", "coding"),
    ("write a program to implement develop create build", "coding"),
    ("data structure algorithm complexity time space", "coding"),
    ("query sql database fetch return select where join api", "coding"),
    ("script configure deploy component react hook prop state", "coding"),
    ("refactor optimize refactoring exception try catch error handling", "coding"),

    # MCQ patterns
    ("which of the following select correct option choose", "MCQ"),
    ("true false assertion reason statement", "MCQ"),
    ("fill in the blank match the following", "MCQ"),
    ("abbreviation full form stands for acronym", "MCQ"),
    ("short answer one word quick recall fact", "MCQ"),
    ("identify select pick correct incorrect right wrong", "MCQ"),
    ("multiple choice choose one valid invalid option a b c d", "MCQ"),
    ("is it true that state whether the following is correct", "MCQ"),
]

# Build the classifier once at module load
_question_type_model = None


def _get_question_type_model():
    """Lazily builds and caches the Naive Bayes classifier."""
    global _question_type_model
    if _question_type_model is not None:
        return _question_type_model

    texts = [item[0] for item in TRAINING_DATA]
    labels = [item[1] for item in TRAINING_DATA]

    _question_type_model = Pipeline([
        ("tfidf", TfidfVectorizer(stop_words="english", lowercase=True)),
        ("clf", MultinomialNB(alpha=1.0))
    ])
    _question_type_model.fit(texts, labels)
    return _question_type_model


def predict_question_type(topic: str) -> dict:
    """
    Predicts whether a topic will likely appear as MCQ, Coding, or Theory.

    Args:
        topic: A single topic string (e.g., "Observer Pattern")

    Returns:
        dict: {
            "predicted_type": "theory" | "coding" | "MCQ",
            "confidence": {
                "theory": 0.65,
                "coding": 0.25,
                "MCQ": 0.10
            }
        }
    """
    model = _get_question_type_model()
    predicted = model.predict([topic])[0]
    probabilities = model.predict_proba([topic])[0]
    classes = model.classes_

    confidence = {cls: round(float(prob), 3) for cls, prob in zip(classes, probabilities)}

    return {
        "predicted_type": predicted,
        "confidence": confidence
    }


def predict_question_types_batch(topics: list) -> dict:
    """
    Predicts question types for a list of topics.

    Args:
        topics: List of topic strings

    Returns:
        dict: {topic: {"predicted_type": "...", "confidence": {...}}}
    """
    if not topics:
        return {}

    return {topic: predict_question_type(topic) for topic in topics}

