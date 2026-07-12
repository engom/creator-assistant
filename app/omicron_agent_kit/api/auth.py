"""API key authentication.

Deliberately simple for early pilots: one static key per tenant, read
from settings. This is the seam to replace with OAuth2/JWT + a real
identity provider before GA — everything downstream (the audit
logger, the route handlers) only depends on getting a `tenant_id`
string back from this dependency, so swapping the mechanism later
doesn't ripple through the rest of the API.
"""

import hashlib

from fastapi import Header, HTTPException, status

from omicron_agent_kit.config import get_settings


def _tenant_id(api_key: str) -> str:
    """Return a stable, non-reversible tenant identifier for the audit log.

    The raw API key must never appear in logs. SHA-256 of the key gives a
    stable 16-char token that correlates audit records to a tenant without
    exposing the credential.
    """
    return hashlib.sha256(api_key.encode()).hexdigest()[:16]


async def require_api_key(x_api_key: str = Header(..., alias="X-API-Key")) -> str:
    settings = get_settings()
    if x_api_key not in settings.api_keys:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )
    # Return a hashed tenant ID, not the raw key — the key is a secret
    # and must not be written to audit logs or forwarded downstream.
    return _tenant_id(x_api_key)
