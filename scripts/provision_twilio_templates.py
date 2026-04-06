#!/usr/bin/env python3
"""
Provision Twilio Content Templates for native WhatsApp interactive buttons.

Usage:
    TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx python scripts/provision_twilio_templates.py

Creates quick-reply templates with dynamic body text ({{1}}) and fixed button labels.
Outputs env vars with ContentSid values for .env / Cloud Run config.
"""

import os
import sys
import json
import httpx

ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
CONTENT_API = "https://content.twilio.com/v1/Content"

TEMPLATES = [
    {
        "friendly_name": "rh_confirm_cancel",
        "env_var": "TWILIO_TPL_CONFIRM_CANCEL",
        "buttons": [
            {"id": "confirm", "title": "Confirm"},
            {"id": "cancel", "title": "Cancel"},
        ],
    },
    {
        "friendly_name": "rh_approve_reject_report",
        "env_var": "TWILIO_TPL_APPROVE_REJECT_REPORT",
        "buttons": [
            {"id": "btn_approve_report", "title": "Approve & Send"},
            {"id": "btn_reject_report", "title": "Reject"},
        ],
    },
    {
        "friendly_name": "rh_approve_reject_outreach",
        "env_var": "TWILIO_TPL_APPROVE_REJECT_OUTREACH",
        "buttons": [
            {"id": "btn_approve_outreach", "title": "Approve & Send"},
            {"id": "btn_reject_outreach", "title": "Reject"},
        ],
    },
    {
        "friendly_name": "rh_done",
        "env_var": "TWILIO_TPL_DONE",
        "buttons": [
            {"id": "done", "title": "Done"},
        ],
    },
    {
        "friendly_name": "rh_search_edit_done",
        "env_var": "TWILIO_TPL_SEARCH_EDIT_DONE",
        "buttons": [
            {"id": "search", "title": "Search"},
            {"id": "edit", "title": "Edit Profile"},
            {"id": "done", "title": "Done"},
        ],
    },
    {
        "friendly_name": "rh_create_help",
        "env_var": "TWILIO_TPL_CREATE_HELP",
        "buttons": [
            {"id": "new_buyer", "title": "Create Buyer"},
            {"id": "help", "title": "Help"},
        ],
    },
    {
        "friendly_name": "rh_viewbuyers_done",
        "env_var": "TWILIO_TPL_VIEWBUYERS_DONE",
        "buttons": [
            {"id": "view_buyers", "title": "View Buyers"},
            {"id": "done", "title": "Done"},
        ],
    },
    {
        "friendly_name": "rh_viewbuyers_new_help",
        "env_var": "TWILIO_TPL_VIEWBUYERS_NEW_HELP",
        "buttons": [
            {"id": "view_buyers", "title": "View Buyers"},
            {"id": "new_buyer", "title": "New Buyer"},
            {"id": "help", "title": "Help"},
        ],
    },
]


def create_template(tpl: dict) -> str | None:
    """Create a single Content Template and return its SID."""
    actions = [{"id": b["id"], "title": b["title"]} for b in tpl["buttons"]]

    payload = {
        "friendly_name": tpl["friendly_name"],
        "language": "en",
        "types": {
            "twilio/quick-reply": {
                "body": "{{1}}",
                "actions": actions,
            }
        },
    }

    resp = httpx.post(
        CONTENT_API,
        json=payload,
        auth=(ACCOUNT_SID, AUTH_TOKEN),
        timeout=30.0,
    )

    if resp.status_code in (200, 201):
        sid = resp.json().get("sid")
        print(f"  Created {tpl['friendly_name']}: {sid}")
        return sid
    else:
        print(f"  ERROR creating {tpl['friendly_name']}: {resp.status_code} {resp.text}")
        return None


def main():
    if not ACCOUNT_SID or not AUTH_TOKEN:
        print("Error: Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars")
        sys.exit(1)

    print(f"Provisioning {len(TEMPLATES)} Content Templates...\n")

    env_lines = []
    for tpl in TEMPLATES:
        sid = create_template(tpl)
        if sid:
            env_lines.append(f'{tpl["env_var"]}={sid}')

    if env_lines:
        print(f"\n# Add to .env or Cloud Run config:")
        for line in env_lines:
            print(line)


if __name__ == "__main__":
    main()
