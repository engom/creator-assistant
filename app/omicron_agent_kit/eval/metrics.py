"""Evaluation metrics for DSPy programs.

These plug into `dspy.evaluate.Evaluate` for scoring, and into
`dspy.teleprompt.MIPROv2` as the metric that guides compilation.
"""

import dspy

_VALID_URGENCY = {"low", "medium", "high"}
_FORBIDDEN_PATTERNS = [
    "will hit",
    "will reach",
    "expected to",
    "going viral",
    "predict",
    "forecast",
]


def insight_correct(example: dspy.Example, prediction, trace=None) -> float:
    """Scored metric for InsightAgent compilation.

    Returns a float in [0, 1]:
      - 1.0  urgency matches AND insight is comparative AND recommended_action non-empty
      - 0.5  urgency matches AND insight is comparative but action missing
      - 0.25 urgency matches but insight contains a forbidden forward-looking phrase
      - 0.0  urgency is wrong or missing

    The forbidden-phrase check enforces the no-predictions rule at compile time.
    """
    gold_urgency = str(getattr(example, "urgency", "")).strip().lower()
    pred_urgency = str(getattr(prediction, "urgency", "")).strip().lower()

    if gold_urgency not in _VALID_URGENCY:
        # Malformed training example — skip rather than penalise a correct prediction.
        return None  # DSPy ignores None-scored examples during optimisation
    if pred_urgency not in _VALID_URGENCY or pred_urgency != gold_urgency:
        return 0.0

    insight = str(getattr(prediction, "insight", "")).lower()
    for phrase in _FORBIDDEN_PATTERNS:
        if phrase in insight:
            return 0.25

    action = str(getattr(prediction, "recommended_action", "")).strip()
    return 1.0 if action else 0.5
