"""
Unit tests for WhatsApp multi-intent parsing and action chaining.

Tests cover:
- Single-intent regression (pattern matching, button/list replies)
- Multi-intent LLM parsing
- Action sequence preview and summary message formatting
- Action sequence serialisation / deserialisation round-trip
"""
import pytest
import sys
import os
import json
from unittest.mock import patch, MagicMock
from dataclasses import asdict

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Import modules directly to avoid triggering db/psycopg imports via __init__.py
import importlib.util

def _load_module(rel_path, module_name):
    base = os.path.join(os.path.dirname(__file__), '..', 'app', 'services', 'whatsapp')
    spec = importlib.util.spec_from_file_location(module_name, os.path.join(base, rel_path))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod

_messages_mod = _load_module('messages.py', 'wa_messages')
_intent_mod = _load_module('intent.py', 'wa_intent')

IntentParser = _intent_mod.IntentParser
Intent = _intent_mod.Intent
IntentType = _intent_mod.IntentType
ActionStep = _intent_mod.ActionStep
MessageBuilder = _messages_mod.MessageBuilder


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_llm_response(content: str):
    """Build a mock OpenAI chat completion response."""
    choice = MagicMock()
    choice.message.content = content
    response = MagicMock()
    response.choices = [choice]
    return response


# ---------------------------------------------------------------------------
# Single-intent regression tests (no LLM needed)
# ---------------------------------------------------------------------------

class TestSingleIntentRegression:
    """Ensure parse_multi returns single-element lists for simple commands."""

    def setup_method(self):
        self.parser = IntentParser()
        self.parser.client = None  # disable LLM

    def test_button_reply(self):
        result = self.parser.parse_multi("search", "button", "idle")
        assert len(result) == 1
        assert result[0].type == IntentType.SEARCH

    def test_list_reply(self):
        result = self.parser.parse_multi("select_buyer_SC1", "list", "idle")
        assert len(result) == 1
        assert result[0].type == IntentType.SELECT_BUYER
        assert result[0].buyer_reference == "SC1"

    def test_pattern_help(self):
        result = self.parser.parse_multi("help", "text", "idle")
        assert len(result) == 1
        assert result[0].type == IntentType.HELP

    def test_pattern_greeting(self):
        result = self.parser.parse_multi("hello", "text", "idle")
        assert len(result) == 1
        assert result[0].type == IntentType.GREETING

    def test_pattern_view_buyers(self):
        result = self.parser.parse_multi("all", "text", "idle")
        assert len(result) == 1
        assert result[0].type == IntentType.VIEW_BUYERS

    def test_pattern_reset(self):
        result = self.parser.parse_multi("reset", "text", "idle")
        assert len(result) == 1
        assert result[0].type == IntentType.RESET

    def test_pattern_confirm(self):
        result = self.parser.parse_multi("yes", "text", "idle")
        assert len(result) == 1
        assert result[0].type == IntentType.CONFIRM

    def test_buyer_code_select(self):
        result = self.parser.parse_multi("SC1", "text", "idle")
        assert len(result) == 1
        assert result[0].type == IntentType.SELECT_BUYER
        assert result[0].buyer_reference == "SC1"

    def test_buyer_code_shortcut(self):
        result = self.parser.parse_multi("SC1 s", "text", "idle")
        assert len(result) == 1
        assert result[0].type == IntentType.SEARCH
        assert result[0].buyer_reference == "SC1"

    def test_unknown_without_llm(self):
        result = self.parser.parse_multi("do something complex", "text", "idle")
        assert len(result) == 1
        assert result[0].type == IntentType.UNKNOWN


# ---------------------------------------------------------------------------
# Multi-intent LLM parsing tests
# ---------------------------------------------------------------------------

class TestMultiIntentLLMParsing:
    """Test _parse_multi_with_llm via mocked OpenAI responses."""

    def setup_method(self):
        self.parser = IntentParser()
        self.parser.client = MagicMock()

    def test_multi_action_search_report_send(self):
        llm_json = json.dumps({
            "actions": [
                {"intent": "select_buyer", "buyer_reference": "Sarah"},
                {"intent": "search"},
                {"intent": "generate_report"},
                {"intent": "send_report"},
            ],
            "confidence": 0.9,
        })
        self.parser.client.chat.completions.create.return_value = _make_llm_response(llm_json)

        result = self.parser.parse_multi(
            "search for Sarah and send her the report",
            "text", "idle",
        )

        assert len(result) == 4
        assert result[0].type == IntentType.SELECT_BUYER
        assert result[0].buyer_reference == "Sarah"
        assert result[1].type == IntentType.SEARCH
        assert result[2].type == IntentType.GENERATE_REPORT
        assert result[3].type == IntentType.SEND_REPORT

    def test_single_action_from_llm(self):
        llm_json = json.dumps({
            "actions": [{"intent": "view_buyers"}],
            "confidence": 0.95,
        })
        self.parser.client.chat.completions.create.return_value = _make_llm_response(llm_json)

        result = self.parser.parse_multi("show me all buyers", "text", "idle")
        assert len(result) == 1
        assert result[0].type == IntentType.VIEW_BUYERS

    def test_llm_returns_markdown_wrapped_json(self):
        llm_json = "```json\n" + json.dumps({
            "actions": [
                {"intent": "select_buyer", "buyer_reference": "SC1"},
                {"intent": "search"},
            ],
            "confidence": 0.85,
        }) + "\n```"
        self.parser.client.chat.completions.create.return_value = _make_llm_response(llm_json)

        result = self.parser.parse_multi("search for SC1", "text", "idle")
        assert len(result) == 2
        assert result[0].type == IntentType.SELECT_BUYER
        assert result[1].type == IntentType.SEARCH

    def test_edit_text_preserved(self):
        llm_json = json.dumps({
            "actions": [
                {"intent": "edit_buyer", "edit_text": "increase budget by 50K"},
            ],
            "confidence": 0.8,
        })
        self.parser.client.chat.completions.create.return_value = _make_llm_response(llm_json)

        result = self.parser.parse_multi(
            "increase the budget by 50K",
            "text", "buyer_context",
            active_buyer={"name": "Sarah", "whatsapp_code": "SC1"},
        )
        assert len(result) == 1
        assert result[0].type == IntentType.EDIT_BUYER
        assert result[0].params.get("edit_text") == "increase budget by 50K"

    def test_llm_json_parse_error_falls_back_to_single(self):
        """If multi-intent JSON parsing fails, fall back to single-intent."""
        # First call (multi) returns garbage, second call (single fallback) returns valid
        single_json = json.dumps({
            "intent": "search",
            "buyer_reference": "Sarah",
            "confidence": 0.7,
        })
        self.parser.client.chat.completions.create.side_effect = [
            _make_llm_response("not valid json {{{"),
            _make_llm_response(single_json),
        ]

        result = self.parser.parse_multi(
            "search for Sarah",
            "text", "idle",
        )
        assert len(result) == 1
        assert result[0].type == IntentType.SEARCH

    def test_empty_actions_array(self):
        llm_json = json.dumps({"actions": [], "confidence": 0.1})
        self.parser.client.chat.completions.create.return_value = _make_llm_response(llm_json)

        result = self.parser.parse_multi("...", "text", "idle")
        assert len(result) == 1
        assert result[0].type == IntentType.UNKNOWN


# ---------------------------------------------------------------------------
# ActionStep dataclass
# ---------------------------------------------------------------------------

class TestActionStep:
    def test_creation(self):
        intent = Intent(type=IntentType.SEARCH, raw_text="search")
        step = ActionStep(intent=intent, step_number=1)
        assert step.step_number == 1
        assert step.depends_on_previous is True
        assert step.intent.type == IntentType.SEARCH


# ---------------------------------------------------------------------------
# MessageBuilder formatting tests
# ---------------------------------------------------------------------------

class TestMessageBuilderSequence:

    def test_action_sequence_preview_basic(self):
        intents = [
            {"type": "select_buyer", "buyer_reference": "Sarah"},
            {"type": "search"},
            {"type": "generate_report"},
            {"type": "send_report"},
        ]
        result = MessageBuilder.action_sequence_preview(
            intents, buyer_name="Sarah Chen", buyer_email="sarah@example.com"
        )
        assert result["type"] == "buttons"
        assert "Sarah Chen" in result["body"]
        assert "1." in result["body"]
        assert "4." in result["body"]
        assert "sarah@example.com" in result["body"]
        assert len(result["buttons"]) == 2
        assert result["buttons"][0]["id"] == "confirm"
        assert result["buttons"][1]["id"] == "cancel"

    def test_action_sequence_preview_no_buyer(self):
        intents = [{"type": "view_buyers"}]
        result = MessageBuilder.action_sequence_preview(intents)
        assert result["type"] == "buttons"
        assert "1." in result["body"]

    def test_action_sequence_summary_all_success(self):
        results = [
            {"step": 1, "intent": "select_buyer", "success": True, "summary": "Selected Sarah"},
            {"step": 2, "intent": "search", "success": True, "summary": "Searched for properties"},
        ]
        msg = MessageBuilder.action_sequence_summary(results)
        assert msg["type"] == "buttons"
        assert "All done" in msg["body"]
        assert "Selected Sarah" in msg["body"]

    def test_action_sequence_summary_partial_failure(self):
        results = [
            {"step": 1, "intent": "select_buyer", "success": True, "summary": "Selected Sarah"},
            {"step": 2, "intent": "search", "success": False, "summary": "Search failed"},
        ]
        msg = MessageBuilder.action_sequence_summary(results)
        assert "partially completed" in msg["body"].lower()
        assert "Search failed" in msg["body"]


# ---------------------------------------------------------------------------
# Intent serialisation round-trip (for pending_action storage)
# ---------------------------------------------------------------------------

class TestIntentSerialisation:
    """Verify intents survive JSON serialisation for pending_action storage."""

    def test_round_trip(self):
        original = Intent(
            type=IntentType.SEARCH,
            buyer_reference="SC1",
            buyer_id=42,
            params={"edit_text": "increase budget"},
            raw_text="search for SC1",
            confidence=0.9,
        )

        serialised = {
            "type": original.type.value,
            "buyer_reference": original.buyer_reference,
            "buyer_id": original.buyer_id,
            "params": original.params,
            "raw_text": original.raw_text,
            "confidence": original.confidence,
        }

        json_str = json.dumps(serialised)
        loaded = json.loads(json_str)

        restored = Intent(
            type=IntentType(loaded["type"]),
            buyer_reference=loaded.get("buyer_reference"),
            buyer_id=loaded.get("buyer_id"),
            params=loaded.get("params", {}),
            raw_text=loaded.get("raw_text", ""),
            confidence=loaded.get("confidence", 1.0),
        )

        assert restored.type == original.type
        assert restored.buyer_reference == original.buyer_reference
        assert restored.buyer_id == original.buyer_id
        assert restored.params == original.params
        assert restored.raw_text == original.raw_text
        assert restored.confidence == original.confidence
