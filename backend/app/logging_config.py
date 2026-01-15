"""
Structured JSON Logging Configuration

Enables filtering logs by agent_id in GCP Cloud Logging.
Usage: gcloud logging read 'jsonPayload.agent_id=42'
"""

import logging
import json
import sys
from datetime import datetime, timezone
from contextvars import ContextVar

# Context variables for request-scoped data
request_id_var: ContextVar[str] = ContextVar("request_id", default=None)
agent_id_var: ContextVar[int] = ContextVar("agent_id", default=None)


class JSONFormatter(logging.Formatter):
    """
    Formats log records as JSON with automatic context injection.
    Compatible with GCP Cloud Logging structured logging.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add request context if available
        request_id = request_id_var.get()
        if request_id:
            log_data["request_id"] = request_id

        agent_id = agent_id_var.get()
        if agent_id:
            log_data["agent_id"] = agent_id

        # Add extra fields from the log record
        if hasattr(record, "action"):
            log_data["action"] = record.action
        if hasattr(record, "extra_data"):
            log_data.update(record.extra_data)

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data)


def setup_logging(level: str = "INFO") -> None:
    """
    Configure structured JSON logging for the application.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR)
    """
    # Remove existing handlers
    root = logging.getLogger()
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    # Create JSON handler for stdout
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())

    # Configure root logger
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    root.addHandler(handler)

    # Reduce noise from third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance with the given name."""
    return logging.getLogger(name)


def log_action(logger: logging.Logger, level: str, action: str, message: str, **kwargs) -> None:
    """
    Log a structured action with additional context.

    Args:
        logger: Logger instance
        level: Log level (info, warning, error)
        action: Action identifier (e.g., "report_email_sent")
        message: Human-readable message
        **kwargs: Additional fields to include in log

    Example:
        log_action(logger, "info", "report_email_sent",
                   "Email sent successfully",
                   share_id="abc-123", to_email="buyer@example.com")
    """
    record = logging.LogRecord(
        name=logger.name,
        level=getattr(logging, level.upper(), logging.INFO),
        pathname="",
        lineno=0,
        msg=message,
        args=(),
        exc_info=None,
    )
    record.action = action
    record.extra_data = kwargs
    logger.handle(record)
