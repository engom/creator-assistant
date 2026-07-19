FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# build-essential covers any ML/agent deps (sklearn, etc.) that need to
# compile from source if a prebuilt wheel isn't available for your arch
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests + source together so uv sync can install the
# project in editable mode (setuptools needs app/ at sync time).
COPY pyproject.toml uv.lock ./
COPY app/ app/

# Install all deps; --no-dev excludes the [dev] optional group.
RUN uv sync --frozen --no-dev

EXPOSE 8000

CMD ["uv", "run", "omicron-serve"]
