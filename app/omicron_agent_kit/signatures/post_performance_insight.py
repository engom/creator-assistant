import dspy


class PostPerformanceInsight(dspy.Signature):
    """Compare a post's early stats to the creator's own rolling baseline and recommend the next action.

    Rules:
    - Use comparative language only: "your engagement rate is 2.4× your 30-day average".
    - Never make forward-looking predictions ("this will hit 1M views", "expected to go viral").
    - Base urgency strictly on the magnitude and direction of the delta vs the baseline.
    - recommended_action must be a concrete next step, not a general observation.
    - urgency = high + positive delta → suggest cross-post staging (requires human approval).
    - urgency = high + negative delta → suggest creator moderates comments or reviews hook.
    - urgency = low → log only, no notification.
    """

    current_stats: str = dspy.InputField(
        desc=(
            "Post stats at the current checkpoint (T+30, T+60, or T+90 min): "
            "views, likes, comments, shares, and retention rate. "
            "Format: 'views=12400 likes=890 comments=134 shares=67 retention=38%'"
        )
    )
    historical_baseline: str = dspy.InputField(
        desc=(
            "Creator's rolling average over their last 10 posts for the same platform. "
            "Format: 'avg_views=8900 avg_likes=610 avg_comments=88 avg_shares=41 avg_retention=31%'"
        )
    )

    insight: str = dspy.OutputField(
        desc="One sentence, comparative, citing the specific stat delta. No predictions."
    )
    urgency: str = dspy.OutputField(desc="low | medium | high")
    recommended_action: str = dspy.OutputField(
        desc=(
            "Concrete next step, e.g. 'Reply to top 3 comments now' or "
            "'Cross-post to Instagram Reels — awaiting your approval'"
        )
    )
