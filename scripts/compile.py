"""Offline compilation script for DSPy agents.

Run from the project root after activating the venv:

    python scripts/compile.py \
        --agent    insight-agent \
        --examples data/examples/insight_agent.jsonl \
        --output   data/compiled/insight_agent.json \
        [--model   anthropic/claude-sonnet-4-6] \
        [--effort  light|medium|heavy] \
        [--train-fraction 0.7]

Example JSONL record (one per line):
    {
      "current_stats": "views=12400 likes=890 comments=134 shares=67 retention=38%",
      "historical_baseline": "avg_views=8900 avg_likes=610 avg_comments=88 avg_shares=41 avg_retention=31%",
      "forecast_context": "",
      "insight": "Your engagement rate at T+45 is 2.4× your 30-day average.",
      "urgency": "high",
      "recommended_action": "Cross-post to Instagram Reels — awaiting your approval."
    }

Compile once against labeled examples, commit the artifact, load at startup
via COMPILED_INSIGHT_PATH in .env.

MIPROv2 default split: 80% held out for validation, 20% for training.
Use --train-fraction to invert that (0.7 = 70% train, 30% val) for small datasets.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from loguru import logger

_AGENT_CONFIG: dict[str, dict] = {
    "insight-agent": {
        "input_keys": ("current_stats", "historical_baseline", "forecast_context"),
        "metric": "insight_correct",
        "build_program": "omicron_agent_kit.agents.insight_agent.InsightAgent.build_program",
    },
}


def load_examples(path: str, input_keys: tuple[str, ...]) -> list:
    import dspy

    examples = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            ex = dspy.Example(**record).with_inputs(*input_keys)
            examples.append(ex)
    return examples


def split_examples(examples: list, train_fraction: float) -> tuple[list, list]:
    import random

    if len(examples) < 4:
        raise ValueError(
            f"Need at least 4 examples to split into train + val, got {len(examples)}. "
            "Add more labeled examples to the JSONL file."
        )
    shuffled = examples[:]
    random.shuffle(shuffled)
    cutoff = min(max(2, int(len(shuffled) * train_fraction)), len(shuffled) - 2)
    return shuffled[:cutoff], shuffled[cutoff:]


def _import(dotted: str):
    import importlib

    parts = dotted.split(".")
    for i in range(len(parts) - 1, 0, -1):
        module_path = ".".join(parts[:i])
        try:
            obj = importlib.import_module(module_path)
        except ImportError:
            continue
        for attr in parts[i:]:
            obj = getattr(obj, attr)
        return obj
    raise ImportError(f"Cannot import '{dotted}'")


def main() -> None:
    parser = argparse.ArgumentParser(description="Compile a DSPy agent with MIPROv2.")
    parser.add_argument(
        "--agent",
        choices=list(_AGENT_CONFIG),
        default="insight-agent",
        help="Which agent to compile.",
    )
    parser.add_argument("--examples", help="Path to labeled JSONL examples.")
    parser.add_argument("--output", help="Path to write the compiled artifact (.json).")
    parser.add_argument("--model", default="anthropic/claude-sonnet-4-6")
    parser.add_argument(
        "--effort",
        choices=["light", "medium", "heavy"],
        default="light",
        help="MIPROv2 auto setting: light ~20 trials, medium ~50, heavy ~100",
    )
    parser.add_argument(
        "--train-fraction",
        type=float,
        default=0.7,
    )
    args = parser.parse_args()

    cfg = _AGENT_CONFIG[args.agent]

    _defaults = {
        "insight-agent": (
            "data/examples/insight_agent.jsonl",
            "data/compiled/insight_agent.json",
        ),
    }
    examples_path = args.examples or _defaults[args.agent][0]
    output_path = args.output or _defaults[args.agent][1]

    import dspy
    from dspy.teleprompt import MIPROv2
    from omicron_agent_kit.config import Settings
    from omicron_agent_kit.llm.providers import build_lm

    lm = build_lm(Settings(llm_model=args.model))
    dspy.configure(lm=lm)

    all_examples = load_examples(examples_path, cfg["input_keys"])
    trainset, valset = split_examples(all_examples, args.train_fraction)
    logger.info(
        "Agent={agent} | Split: {total} total → {train} train / {val} val  "
        "(--train-fraction {frac})",
        agent=args.agent,
        total=len(all_examples),
        train=len(trainset),
        val=len(valset),
        frac=args.train_fraction,
    )

    import omicron_agent_kit.eval.metrics as _metrics

    metric = getattr(_metrics, cfg["metric"])
    build_program = _import(cfg["build_program"])
    program = build_program()

    optimizer = MIPROv2(metric=metric, auto=args.effort, verbose=True)
    compiled = optimizer.compile(program, trainset=trainset, valset=valset)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    compiled.save(output_path)
    logger.info("Compiled artifact saved to {path}", path=output_path)


if __name__ == "__main__":
    main()
