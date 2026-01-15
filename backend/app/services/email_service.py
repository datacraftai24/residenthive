"""
Email Service with Provider Abstraction

Supports multiple email providers via factory pattern.
Default: Mailjet. Set EMAIL_PROVIDER=console for dev/testing.
"""

import os
from abc import ABC, abstractmethod
from ..logging_config import get_logger

logger = get_logger(__name__)

# Config
EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "mailjet")  # mailjet | console
DEFAULT_FROM_EMAIL = os.getenv("EMAIL_FROM", "noreply@residenthive.com")
DEFAULT_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "ResidentHive")


class EmailProvider(ABC):
    """Abstract base for email providers - easy to swap vendors."""

    @abstractmethod
    def send(self, to_email: str, from_email: str, from_name: str,
             subject: str, body: str, reply_to: str = None) -> bool:
        pass


class MailjetProvider(EmailProvider):
    """Mailjet implementation."""

    def __init__(self):
        from mailjet_rest import Client as MailjetClient
        api_key = os.getenv("MAILJET_API_KEY")
        api_secret = os.getenv("MAILJET_API_SECRET")
        if not api_key or not api_secret:
            raise ValueError("MAILJET_API_KEY and MAILJET_API_SECRET required")
        self.client = MailjetClient(auth=(api_key, api_secret), version='v3.1')

    def send(self, to_email: str, from_email: str, from_name: str,
             subject: str, body: str, reply_to: str = None) -> bool:
        data = {
            'Messages': [{
                'From': {'Email': from_email, 'Name': from_name},
                'To': [{'Email': to_email}],
                'Subject': subject,
                'TextPart': body,
            }]
        }
        if reply_to:
            data['Messages'][0]['ReplyTo'] = {'Email': reply_to}

        logger.info(
            "Sending email via Mailjet",
            extra={
                "action": "email_send_attempt",
                "extra_data": {
                    "provider": "mailjet",
                    "to_email": to_email,
                    "from_email": from_email,
                    "subject": subject,
                }
            }
        )

        result = self.client.send.create(data=data)
        response_json = result.json()
        success = result.status_code == 200

        if success:
            logger.info(
                "Email sent successfully",
                extra={
                    "action": "email_sent",
                    "extra_data": {
                        "provider": "mailjet",
                        "to_email": to_email,
                        "status_code": result.status_code,
                    }
                }
            )
        else:
            logger.error(
                f"Email send failed: {response_json}",
                extra={
                    "action": "email_send_failed",
                    "extra_data": {
                        "provider": "mailjet",
                        "to_email": to_email,
                        "status_code": result.status_code,
                        "error": response_json,
                    }
                }
            )
        return success


class ConsoleProvider(EmailProvider):
    """Dev/testing - logs email instead of sending."""

    def send(self, to_email: str, from_email: str, from_name: str,
             subject: str, body: str, reply_to: str = None) -> bool:
        logger.info(
            "Email sent (console provider)",
            extra={
                "action": "email_sent",
                "extra_data": {
                    "provider": "console",
                    "to_email": to_email,
                    "from_email": from_email,
                    "from_name": from_name,
                    "subject": subject,
                    "reply_to": reply_to,
                    "body_preview": body[:200] + "..." if len(body) > 200 else body,
                }
            }
        )
        return True


# Provider factory
def get_provider() -> EmailProvider:
    if EMAIL_PROVIDER == "mailjet":
        return MailjetProvider()
    elif EMAIL_PROVIDER == "console":
        return ConsoleProvider()
    else:
        raise ValueError(f"Unknown EMAIL_PROVIDER: {EMAIL_PROVIDER}")


# Main entry point
def send_email(
    to_email: str,
    from_email: str = None,
    subject: str = "",
    body: str = "",
    reply_to: str = None,
    from_name: str = None
) -> bool:
    """Send email via configured provider. Returns True on success."""
    provider = get_provider()
    return provider.send(
        to_email=to_email,
        from_email=from_email or DEFAULT_FROM_EMAIL,
        from_name=from_name or DEFAULT_FROM_NAME,
        subject=subject,
        body=body,
        reply_to=reply_to
    )
