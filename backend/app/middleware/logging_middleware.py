"""
Logging Middleware

Injects request_id and agent_id into logging context for all requests.
Enables filtering logs by agent in GCP Cloud Logging.
"""

import uuid
import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from ..logging_config import request_id_var, agent_id_var, get_logger

logger = get_logger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that sets up logging context for each request.

    - Generates unique request_id for tracing
    - Extracts agent_id from authenticated requests
    - Logs request start/end with timing
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Generate unique request ID
        request_id = str(uuid.uuid4())[:8]
        request_id_var.set(request_id)

        # Try to extract agent_id from request state (set by auth)
        agent_id = None
        if hasattr(request.state, "agent_id"):
            agent_id = request.state.agent_id
            agent_id_var.set(agent_id)

        # Log request start
        start_time = time.time()
        method = request.method
        path = request.url.path

        # Skip logging for health checks and static assets
        skip_logging = path in ["/health", "/favicon.ico"] or path.startswith("/static")

        if not skip_logging:
            logger.info(
                f"Request started",
                extra={
                    "action": "request_start",
                    "extra_data": {
                        "method": method,
                        "path": path,
                        "request_id": request_id,
                        "agent_id": agent_id,
                    }
                }
            )

        try:
            response = await call_next(request)

            # Try to get agent_id again after auth middleware has run
            if agent_id is None and hasattr(request.state, "agent_id"):
                agent_id = request.state.agent_id
                agent_id_var.set(agent_id)

            if not skip_logging:
                duration_ms = int((time.time() - start_time) * 1000)
                logger.info(
                    f"Request completed",
                    extra={
                        "action": "request_end",
                        "extra_data": {
                            "method": method,
                            "path": path,
                            "status_code": response.status_code,
                            "duration_ms": duration_ms,
                            "request_id": request_id,
                            "agent_id": agent_id,
                        }
                    }
                )

            return response

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error(
                f"Request failed: {str(e)}",
                extra={
                    "action": "request_error",
                    "extra_data": {
                        "method": method,
                        "path": path,
                        "error": str(e),
                        "duration_ms": duration_ms,
                        "request_id": request_id,
                        "agent_id": agent_id,
                    }
                },
                exc_info=True
            )
            raise
        finally:
            # Clear context vars
            request_id_var.set(None)
            agent_id_var.set(None)
