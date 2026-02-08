"""
WhatsApp Action Handlers

Executes actions based on parsed intents, calling existing backend APIs
and formatting responses for WhatsApp.

Each handler:
1. Validates the request
2. Calls existing backend APIs
3. Updates session state
4. Returns formatted response
"""

import logging
from typing import Dict, Any, Optional, List

from .session import SessionManager, AgentSession, SessionState
from .intent import IntentParser, Intent, IntentType, resolve_buyer_from_intent
from .messages import MessageBuilder
from .buyer_codes import (
    get_buyer_by_code,
    get_buyers_by_name,
    resolve_buyer_reference,
    assign_code_to_buyer,
    format_buyer_code_display
)
from ...db import get_conn, fetchone_dict, fetchall_dicts

logger = logging.getLogger(__name__)


class WhatsAppHandlers:
    """
    Handle WhatsApp message intents.
    
    Orchestrates:
    - Intent parsing
    - Session management
    - API calls to existing endpoints
    - Response formatting
    """
    
    def __init__(self, agent_id: int, phone: str, session: AgentSession):
        self.agent_id = agent_id
        self.phone = phone
        self.session = session
        self.intent_parser = IntentParser()
    
    async def handle_message(
        self,
        message: str,
        input_type: str = "text"
    ) -> Dict[str, Any]:
        """
        Main entry point for handling a WhatsApp message.
        
        Args:
            message: Message text or button/list ID
            input_type: "text", "button", or "list"
            
        Returns:
            Response dict for WhatsAppClient
        """
        try:
            # Get buyers for context
            buyers = self._get_all_buyers()
            
            # Get active buyer if in context
            active_buyer = None
            if self.session.active_buyer_id:
                active_buyer = self._get_buyer_by_id(self.session.active_buyer_id)
            
            # Parse intent
            intent = self.intent_parser.parse(
                message=message,
                input_type=input_type,
                session_state=self.session.state.value,
                active_buyer=active_buyer,
                buyers=buyers
            )
            
            # Resolve buyer reference if present
            intent = resolve_buyer_from_intent(intent, self.agent_id, active_buyer)
            
            logger.info(
                f"Parsed intent: type={intent.type.value}, "
                f"buyer_ref={intent.buyer_reference}, buyer_id={intent.buyer_id}"
            )
            
            # Route to appropriate handler
            response = await self._route_intent(intent, active_buyer, buyers)
            
            # Add intent to response for logging
            response["intent"] = intent.type.value
            
            return response
            
        except Exception as e:
            logger.error(f"Error handling message: {e}", exc_info=True)
            return MessageBuilder.error()
    
    async def _route_intent(
        self,
        intent: Intent,
        active_buyer: Optional[Dict[str, Any]],
        buyers: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Route intent to appropriate handler."""
        
        handlers = {
            IntentType.VIEW_BUYERS: lambda: self._handle_view_buyers(buyers),
            IntentType.SELECT_BUYER: lambda: self._handle_select_buyer(intent, buyers),
            IntentType.VIEW_PROFILE: lambda: self._handle_view_profile(active_buyer),
            IntentType.EXIT_CONTEXT: lambda: self._handle_exit_context(),
            IntentType.HELP: lambda: self._handle_help(),
            IntentType.GREETING: lambda: self._handle_greeting(),
            IntentType.SEARCH: lambda: self._handle_search(intent, active_buyer),
            IntentType.VIEW_RESULTS: lambda: self._handle_view_results(),
            IntentType.GENERATE_REPORT: lambda: self._handle_generate_report(active_buyer),
            IntentType.SEND_REPORT: lambda: self._handle_send_report(intent, active_buyer),
            IntentType.CREATE_BUYER: lambda: self._handle_create_buyer(intent),
            IntentType.EDIT_BUYER: lambda: self._handle_edit_buyer(intent, active_buyer),
            IntentType.CONFIRM: lambda: self._handle_confirm(),
            IntentType.CANCEL: lambda: self._handle_cancel(),
            IntentType.VIEW_SAVED: lambda: self._handle_view_saved(active_buyer),
            IntentType.VIEW_NOTES: lambda: self._handle_view_notes(active_buyer),
            IntentType.RESET: lambda: self._handle_reset(),
            IntentType.UNKNOWN: lambda: self._handle_unknown(intent),
        }
        
        handler = handlers.get(intent.type, lambda: self._handle_unknown(intent))
        return await handler()
    
    # =========================================================================
    # Navigation Handlers
    # =========================================================================
    
    async def _handle_view_buyers(self, buyers: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Show list of all buyers."""
        self.session.state = SessionState.BUYER_LIST
        self.session.clear_buyer_context()
        await SessionManager.save(self.session)
        
        return MessageBuilder.buyer_list(buyers)
    
    async def _handle_select_buyer(
        self,
        intent: Intent,
        buyers: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Select a specific buyer to focus on."""
        
        # Check for ambiguous matches
        if intent.params.get("ambiguous_matches"):
            return MessageBuilder.disambiguation(
                intent.params["ambiguous_matches"],
                intent.buyer_reference or ""
            )
        
        # Get buyer by ID or reference
        buyer = None
        if intent.buyer_id:
            buyer = self._get_buyer_by_id(intent.buyer_id)
        elif intent.buyer_reference:
            matches = resolve_buyer_reference(self.agent_id, intent.buyer_reference)
            if len(matches) == 1:
                buyer = matches[0]
            elif len(matches) > 1:
                return MessageBuilder.disambiguation(matches, intent.buyer_reference)
        
        if not buyer:
            return MessageBuilder.text(
                f"I couldn't find a buyer matching \"{intent.buyer_reference}\".\n\n"
                "Try typing their full name or code (e.g., SC1)."
            )
        
        # Enter buyer context
        code = buyer.get("whatsapp_code") or ""
        name = buyer.get("name", "Unknown")
        
        # Assign code if missing
        if not code:
            code = assign_code_to_buyer(buyer["id"], self.agent_id, name)
            buyer["whatsapp_code"] = code
        
        self.session.set_buyer_context(buyer["id"], code, name)
        await SessionManager.save(self.session)
        
        return MessageBuilder.buyer_context_entered(buyer)
    
    async def _handle_exit_context(self) -> Dict[str, Any]:
        """Exit buyer context, return to idle."""
        self.session.clear_buyer_context()
        await SessionManager.save(self.session)
        
        return MessageBuilder.context_exited()
    
    async def _handle_reset(self) -> Dict[str, Any]:
        """Reset/clear the entire session."""
        await SessionManager.delete(self.phone)
        self.session = await SessionManager.get_or_create(self.agent_id, self.phone)
        agent_name = self._get_agent_name()
        return MessageBuilder.welcome(agent_name)
    
    async def _handle_help(self) -> Dict[str, Any]:
        """Show help message."""
        in_context = self.session.is_in_buyer_context()
        return MessageBuilder.help_message(in_buyer_context=in_context)
    
    async def _handle_greeting(self) -> Dict[str, Any]:
        """Handle greeting/welcome."""
        agent_name = self._get_agent_name()
        return MessageBuilder.welcome(agent_name)
    
    # =========================================================================
    # Profile Handlers
    # =========================================================================
    
    async def _handle_view_profile(
        self,
        active_buyer: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Show buyer profile details."""
        if not active_buyer:
            return MessageBuilder.text(
                "No buyer selected. Use 'all' to see your buyers, "
                "then select one to view their profile."
            )
        
        return MessageBuilder.buyer_card(active_buyer, show_actions=True)
    
    async def _handle_view_saved(
        self,
        active_buyer: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Show saved properties for buyer."""
        if not active_buyer:
            return MessageBuilder.text("No buyer selected.")
        
        # Get saved properties from database
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT pi.property_id, pi.interaction_type, pi.created_at,
                           rl.address, rl.city, rl.price, rl.bedrooms, rl.bathrooms
                    FROM property_interactions pi
                    LEFT JOIN repliers_listings rl ON pi.property_id = rl.id
                    WHERE pi.profile_id = %s AND pi.interaction_type = 'saved'
                    ORDER BY pi.created_at DESC
                    LIMIT 10
                    """,
                    (active_buyer["id"],)
                )
                saved = fetchall_dicts(cur)
        
        if not saved:
            return MessageBuilder.buttons(
                f"*{active_buyer.get('name')}* hasn't saved any properties yet.\n\n"
                "Run a search to find properties for them.",
                [
                    {"id": "search", "title": "Search"},
                    {"id": "done", "title": "Back"}
                ]
            )
        
        lines = [f"📌 Saved properties for *{active_buyer.get('name')}*:", ""]
        for prop in saved:
            addr = prop.get("address", "Unknown")[:30]
            price = prop.get("price", 0)
            beds = prop.get("bedrooms", "?")
            lines.append(f"• {addr} - ${price:,} ({beds}bd)")
        
        return MessageBuilder.buttons(
            "\n".join(lines),
            [
                {"id": "search", "title": "New Search"},
                {"id": "done", "title": "Back"}
            ]
        )
    
    async def _handle_view_notes(
        self,
        active_buyer: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Show buyer's notes/feedback on reports."""
        if not active_buyer:
            return MessageBuilder.text("No buyer selected.")
        
        # Get latest report with notes
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT share_id, buyer_notes, buyer_notes_updated_at, created_at
                    FROM buyer_reports
                    WHERE profile_id = %s AND buyer_notes IS NOT NULL
                    ORDER BY buyer_notes_updated_at DESC
                    LIMIT 1
                    """,
                    (active_buyer["id"],)
                )
                report = fetchone_dict(cur)
        
        if not report or not report.get("buyer_notes"):
            return MessageBuilder.buttons(
                f"*{active_buyer.get('name')}* hasn't left any notes yet.\n\n"
                "They can add notes when viewing their buyer report.",
                [
                    {"id": "report", "title": "View Report"},
                    {"id": "done", "title": "Back"}
                ]
            )
        
        notes = report.get("buyer_notes", "")[:500]
        updated = report.get("buyer_notes_updated_at")
        
        return MessageBuilder.buttons(
            f"📝 Notes from *{active_buyer.get('name')}*:\n\n"
            f"\"{notes}\"\n\n"
            f"_Updated: {updated.strftime('%b %d') if updated else 'Unknown'}_",
            [
                {"id": "search", "title": "Update Search"},
                {"id": "done", "title": "Back"}
            ]
        )
    
    # =========================================================================
    # Search & Report Handlers
    # =========================================================================
    
    async def _handle_search(
        self,
        intent: Intent,
        active_buyer: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Trigger property search for buyer."""
        # If buyer specified in intent, select them first
        if intent.buyer_id and intent.buyer_id != self.session.active_buyer_id:
            buyer = self._get_buyer_by_id(intent.buyer_id)
            if buyer:
                code = buyer.get("whatsapp_code", "")
                self.session.set_buyer_context(buyer["id"], code, buyer.get("name", ""))
                await SessionManager.save(self.session)
                active_buyer = buyer
        
        if not active_buyer:
            return MessageBuilder.text(
                "Which buyer should I search for?\n\n"
                "Select a buyer first, or say 'search for [name]'."
            )
        
        # Update session state
        self.session.state = SessionState.SEARCHING
        self.session.sub_state = "running"
        await SessionManager.save(self.session)
        
        # Trigger search using existing API
        try:
            from ..search_context_store import generate_search_id, store_search_context
            from ...routers.listings import listings_search, _load_profile
            
            # Run the search
            profile = _load_profile(active_buyer["id"])
            result = listings_search({"profileId": active_buyer["id"], "profile": {}})
            
            # Get listings
            all_listings = result.get("top_picks", []) + result.get("other_matches", [])
            
            # Map to consistent format
            listings = []
            for item in all_listings[:20]:
                listing = item.get("listing", item)
                listings.append({
                    "mlsNumber": listing.get("mls_number") or listing.get("id"),
                    "address": listing.get("address"),
                    "city": listing.get("city"),
                    "listPrice": listing.get("price"),
                    "bedrooms": listing.get("bedrooms"),
                    "bathrooms": listing.get("bathrooms"),
                    "sqft": listing.get("square_feet"),
                    "fitScore": item.get("fitScore") or item.get("match_score"),
                    "aiAnalysis": item.get("ai_analysis"),
                })
            
            # Generate search ID and store context
            search_id = generate_search_id()
            store_search_context(search_id, profile, listings)
            
            # Update session with search ID
            self.session.last_search_id = search_id
            self.session.state = SessionState.BUYER_CONTEXT
            self.session.sub_state = "results"
            await SessionManager.save(self.session)
            
            total_found = result.get("search_summary", {}).get("total_found", len(listings))
            
            return MessageBuilder.search_results(
                buyer=active_buyer,
                listings=listings[:5],
                total_found=total_found
            )
            
        except Exception as e:
            logger.error(f"Search failed: {e}", exc_info=True)
            self.session.state = SessionState.BUYER_CONTEXT
            self.session.sub_state = None
            await SessionManager.save(self.session)
            
            return MessageBuilder.error(
                f"Search failed for {active_buyer.get('name')}.\n\n"
                "Please try again or check the buyer's criteria."
            )
    
    async def _handle_view_results(self) -> Dict[str, Any]:
        """View previous search results."""
        if not self.session.last_search_id:
            return MessageBuilder.text(
                "No recent search found. Run a new search first."
            )
        
        # Get results from search context
        from ..search_context_store import get_search_context
        
        context = get_search_context(self.session.last_search_id)
        if not context:
            return MessageBuilder.text(
                "Search results have expired. Please run a new search."
            )
        
        buyer = self._get_buyer_by_id(self.session.active_buyer_id) if self.session.active_buyer_id else {}
        listings = context.get("ranked_listings", [])[:5]
        
        return MessageBuilder.search_results(
            buyer=buyer,
            listings=listings,
            total_found=len(context.get("ranked_listings", []))
        )
    
    async def _handle_generate_report(
        self,
        active_buyer: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Generate buyer report from search results."""
        if not active_buyer:
            return MessageBuilder.text("No buyer selected.")
        
        if not self.session.last_search_id:
            return MessageBuilder.text(
                "No search results to generate report from.\n\n"
                "Run a search first, then generate the report."
            )
        
        try:
            # Generate report using existing API
            from ...routers.buyer_reports import create_buyer_report, CreateBuyerReportRequest
            import os
            
            request = CreateBuyerReportRequest(
                searchId=self.session.last_search_id,
                profileId=active_buyer["id"],
                allowPartial=True
            )
            
            # Call the report generation (without auth dependency for internal use)
            result = create_buyer_report(request, agent_id=self.agent_id)
            
            share_id = result.get("shareId")
            share_url = result.get("shareUrl", f"/buyer-report/{share_id}")
            
            # Make full URL
            frontend_url = os.getenv("FRONTEND_BASE_URL", "https://app.residenthive.com")
            full_url = f"{frontend_url}{share_url}"
            
            listing_count = result.get("includedCount", 5)
            
            return MessageBuilder.report_ready(
                buyer=active_buyer,
                share_url=full_url,
                listing_count=listing_count
            )
            
        except Exception as e:
            logger.error(f"Report generation failed: {e}", exc_info=True)
            return MessageBuilder.error(
                "Failed to generate report. Please try again."
            )
    
    async def _handle_send_report(
        self,
        intent: Intent,
        active_buyer: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Send report to buyer via email."""
        if not active_buyer:
            return MessageBuilder.text("No buyer selected.")
        
        email = active_buyer.get("email")
        if not email:
            return MessageBuilder.text(
                f"{active_buyer.get('name')} doesn't have an email address.\n\n"
                "Add their email first, then send the report."
            )
        
        # Check if we should generate first
        if intent.params.get("generate_first") or not self.session.last_search_id:
            # First run search, then generate, then send
            # For now, just prompt them to generate first
            return MessageBuilder.text(
                "Please generate a report first, then send it.\n\n"
                "Use 'search' → 'report' → 'send'"
            )
        
        # Get latest report
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT share_id FROM buyer_reports
                    WHERE profile_id = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (active_buyer["id"],)
                )
                report = fetchone_dict(cur)
        
        if not report:
            return MessageBuilder.text(
                "No report found to send. Generate a report first."
            )
        
        try:
            # Send report using existing API
            from ...routers.buyer_reports import send_buyer_report_email, SendReportEmailRequest
            
            request = SendReportEmailRequest(to_email=email)
            send_buyer_report_email(report["share_id"], request, agent_id=self.agent_id)
            
            return MessageBuilder.report_sent(active_buyer)
            
        except Exception as e:
            logger.error(f"Failed to send report: {e}", exc_info=True)
            return MessageBuilder.error(
                f"Failed to send report to {email}. Please try again."
            )
    
    # =========================================================================
    # Create/Edit Handlers
    # =========================================================================
    
    async def _handle_create_buyer(self, intent: Intent) -> Dict[str, Any]:
        """Start or process buyer creation."""
        
        # If just entering create mode
        if self.session.state != SessionState.CREATING_BUYER:
            self.session.state = SessionState.CREATING_BUYER
            self.session.sub_state = "awaiting_input"
            await SessionManager.save(self.session)
            return MessageBuilder.create_buyer_prompt()
        
        # If we have input, process it
        raw_text = intent.raw_text
        if not raw_text or raw_text.lower() in ("new", "new buyer", "create"):
            return MessageBuilder.create_buyer_prompt()
        
        # Extract profile using existing NLP
        try:
            from ...routers.nlp import extract_profile
            
            result = extract_profile({"input": raw_text})
            extracted = result.get("profile", {})
            
            if not extracted.get("name") or not extracted.get("location"):
                return MessageBuilder.text(
                    "I couldn't extract enough information.\n\n"
                    "Please include at least:\n"
                    "• Buyer's name\n"
                    "• Location/area\n"
                    "• Budget range\n\n"
                    "Or type 'cancel' to go back."
                )
            
            # Store pending action for confirmation
            await SessionManager.set_pending_action(
                self.phone,
                "create_buyer",
                {"extracted_profile": extracted}
            )
            
            return MessageBuilder.buyer_extracted(extracted)
            
        except Exception as e:
            logger.error(f"Profile extraction failed: {e}", exc_info=True)
            return MessageBuilder.error(
                "Failed to process buyer information. Please try again."
            )
    
    async def _handle_edit_buyer(
        self,
        intent: Intent,
        active_buyer: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Handle buyer profile edits."""
        if not active_buyer:
            return MessageBuilder.text("No buyer selected.")
        
        # If just "edit" with no specifics, enter edit mode
        edit_text = intent.params.get("edit_text") or intent.raw_text
        if edit_text.lower() in ("edit", "update", "change", "modify"):
            self.session.state = SessionState.EDITING_BUYER
            await SessionManager.save(self.session)
            
            return MessageBuilder.text(
                f"📝 Editing *{active_buyer.get('name')}*\n\n"
                "Tell me what to change. Examples:\n"
                "• \"Increase budget by $50K\"\n"
                "• \"Add pool to must-haves\"\n"
                "• \"Remove garage requirement\"\n"
                "• \"Change location to Brookline\"\n\n"
                "_Type your changes or 'cancel'_"
            )
        
        # Parse changes - try Gemini conversational endpoint first, fall back to OpenAI
        try:
            changes = await self._parse_edit_changes(active_buyer, edit_text)
            
            if not changes:
                return MessageBuilder.text(
                    "I couldn't understand what to change.\n\n"
                    "Try being more specific, like:\n"
                    "• \"Increase budget to $700K\"\n"
                    "• \"Add 4th bedroom requirement\""
                )
            
            # Store pending action
            await SessionManager.set_pending_action(
                self.phone,
                "edit_buyer",
                {"buyer_id": active_buyer["id"], "changes": changes}
            )
            
            return MessageBuilder.edit_confirmation(active_buyer, changes)
            
        except Exception as e:
            logger.error(f"Parse changes failed: {e}", exc_info=True)
            return MessageBuilder.error("Failed to parse changes. Please try again.")
    
    # =========================================================================
    # Confirmation Handlers
    # =========================================================================
    
    async def _handle_confirm(self) -> Dict[str, Any]:
        """Handle confirmation of pending action."""
        pending = self.session.pending_action
        if not pending:
            return MessageBuilder.text("Nothing to confirm.")
        
        action_type = pending.get("type")
        action_data = pending.get("data", {})
        
        try:
            if action_type == "create_buyer":
                return await self._execute_create_buyer(action_data)
            elif action_type == "edit_buyer":
                return await self._execute_edit_buyer(action_data)
            else:
                return MessageBuilder.error(f"Unknown action type: {action_type}")
                
        finally:
            await SessionManager.clear_pending_action(self.phone)
    
    async def _execute_create_buyer(self, action_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute buyer creation after confirmation."""
        extracted = action_data.get("extracted_profile", {})
        
        try:
            from ...routers.profiles import create_profile
            from ...models import BuyerProfileCreate
            
            # Map extracted to create request
            profile_data = BuyerProfileCreate(
                name=extracted.get("name", "Unknown"),
                email=extracted.get("email", "placeholder@residenthive.com"),
                location=extracted.get("location", ""),
                budget=extracted.get("budget", ""),
                budgetMin=extracted.get("budgetMin"),
                budgetMax=extracted.get("budgetMax"),
                homeType=extracted.get("homeType", "any"),
                bedrooms=extracted.get("bedrooms", 3),
                bathrooms=extracted.get("bathrooms", "2"),
                mustHaveFeatures=extracted.get("mustHaveFeatures", []),
                dealbreakers=extracted.get("dealbreakers", []),
                rawInput=extracted.get("rawInput", ""),
                inputMethod="whatsapp",
            )
            
            result = create_profile(profile_data, agent_id=self.agent_id)
            
            # Assign buyer code
            buyer_id = result.id
            code = assign_code_to_buyer(buyer_id, self.agent_id, result.name)
            
            # Enter buyer context
            self.session.set_buyer_context(buyer_id, code, result.name)
            self.session.state = SessionState.BUYER_CONTEXT
            await SessionManager.save(self.session)
            
            return MessageBuilder.buttons(
                f"✅ Created *{result.name}* ({code})\n\n"
                "What would you like to do next?",
                [
                    {"id": "search", "title": "Search Now"},
                    {"id": "profile", "title": "View Profile"},
                    {"id": "done", "title": "Back to List"}
                ]
            )
            
        except Exception as e:
            logger.error(f"Create buyer failed: {e}", exc_info=True)
            return MessageBuilder.error("Failed to create buyer. Please try again.")
    
    @staticmethod
    def _sanitize_change_value(field: str, value):
        """Ensure change values have the correct type for the database."""
        if value is None:
            return value
        # Budget and numeric fields must be integers
        if field in ("budgetMin", "budgetMax", "bedrooms", "bathrooms"):
            if isinstance(value, (int, float)):
                return int(value)
            # Strip currency formatting: "$1,010,000" -> 1010000
            cleaned = str(value).replace("$", "").replace(",", "").replace(" ", "")
            # Handle K/M suffixes
            cleaned_lower = cleaned.lower()
            try:
                if cleaned_lower.endswith("m"):
                    return int(float(cleaned_lower[:-1]) * 1_000_000)
                elif cleaned_lower.endswith("k"):
                    return int(float(cleaned_lower[:-1]) * 1_000)
                return int(float(cleaned))
            except (ValueError, TypeError):
                return value
        return value

    async def _execute_edit_buyer(self, action_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute buyer edit after confirmation."""
        buyer_id = action_data.get("buyer_id")
        changes = action_data.get("changes", [])
        
        try:
            from ...routers.conversational import apply_changes, ApplyChangesRequest, ChangeItem
            
            # Sanitize change values to ensure correct types
            for change in changes:
                change["newValue"] = self._sanitize_change_value(
                    change.get("field", ""), change.get("newValue")
                )
                change["oldValue"] = self._sanitize_change_value(
                    change.get("field", ""), change.get("oldValue")
                )
            
            # Create mock request
            class MockRequest:
                pass
            mock_req = MockRequest()
            
            change_items = [ChangeItem(**c) for c in changes]
            req = ApplyChangesRequest(changes=change_items)
            
            result = await apply_changes(buyer_id, req, mock_req, agent_id=self.agent_id)
            
            # Update session with new buyer data
            self.session.active_buyer_name = result.get("name", self.session.active_buyer_name)
            await SessionManager.save(self.session)
            
            return MessageBuilder.buttons(
                f"✅ Updated *{result.get('name')}*\n\n"
                "Changes applied successfully.",
                [
                    {"id": "search", "title": "Search Again"},
                    {"id": "profile", "title": "View Profile"},
                    {"id": "done", "title": "Done"}
                ]
            )
            
        except Exception as e:
            logger.error(f"Edit buyer failed: {e}", exc_info=True)
            return MessageBuilder.error("Failed to update buyer. Please try again.")
    
    async def _handle_cancel(self) -> Dict[str, Any]:
        """Handle cancellation of pending action."""
        await SessionManager.clear_pending_action(self.phone)
        
        # Return to appropriate state
        if self.session.active_buyer_id:
            buyer = self._get_buyer_by_id(self.session.active_buyer_id)
            return MessageBuilder.buyer_context_entered(buyer) if buyer else MessageBuilder.context_exited()
        
        return MessageBuilder.context_exited()
    
    # =========================================================================
    # Fallback Handler
    # =========================================================================
    
    async def _handle_unknown(self, intent: Intent) -> Dict[str, Any]:
        """Handle unknown/unrecognized intents."""
        
        # If in edit mode, treat as edit text
        if self.session.state == SessionState.EDITING_BUYER:
            active_buyer = self._get_buyer_by_id(self.session.active_buyer_id)
            intent.params["edit_text"] = intent.raw_text
            return await self._handle_edit_buyer(intent, active_buyer)
        
        # If in create mode, treat as buyer info
        if self.session.state == SessionState.CREATING_BUYER:
            return await self._handle_create_buyer(intent)
        
        # Otherwise, suggest help
        if self.session.is_in_buyer_context():
            return MessageBuilder.text(
                f"I didn't understand that.\n\n"
                f"Currently focused on: {self.session.active_buyer_name}\n\n"
                "Try 'search', 'report', 'edit', or 'done'.\n"
                "Type 'help' for all commands."
            )
        
        return MessageBuilder.help_message()
    
    # =========================================================================
    # Helper Methods
    # =========================================================================
    
    def _get_all_buyers(self) -> List[Dict[str, Any]]:
        """Get all buyers for agent."""
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, name, email, phone, location, budget, budget_min, budget_max,
                           bedrooms, bathrooms, must_have_features, dealbreakers, whatsapp_code,
                           created_at
                    FROM buyer_profiles 
                    WHERE agent_id = %s
                    ORDER BY created_at DESC
                    """,
                    (self.agent_id,)
                )
                return fetchall_dicts(cur)
    
    def _get_buyer_by_id(self, buyer_id: int) -> Optional[Dict[str, Any]]:
        """Get buyer by ID."""
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT * FROM buyer_profiles 
                    WHERE id = %s AND agent_id = %s
                    """,
                    (buyer_id, self.agent_id)
                )
                return fetchone_dict(cur)
    
    async def _parse_edit_changes(
        self,
        buyer: Dict[str, Any],
        edit_text: str
    ) -> List[Dict[str, Any]]:
        """
        Parse edit text into structured changes.
        Tries Gemini-based conversational endpoint first, falls back to OpenAI.
        """
        # Try Gemini-based endpoint first
        try:
            from ...routers.conversational import parse_changes, ParseChangesRequest
            
            current_profile = {
                "budgetMin": buyer.get("budget_min"),
                "budgetMax": buyer.get("budget_max"),
                "bedrooms": buyer.get("bedrooms"),
                "mustHaveFeatures": buyer.get("must_have_features", []),
                "dealbreakers": buyer.get("dealbreakers", []),
            }
            
            class MockRequest:
                pass
            
            req = ParseChangesRequest(text=edit_text, currentProfile=current_profile)
            result = await parse_changes(buyer["id"], req, MockRequest(), agent_id=self.agent_id)
            return result.get("changes", [])
        except Exception as e:
            logger.info(f"Gemini parse_changes unavailable ({e}), falling back to OpenAI")
        
        # Fallback: use OpenAI to parse changes
        import json
        import os
        from openai import OpenAI
        
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("No AI service available for parsing changes")
        
        client = OpenAI(api_key=api_key)
        
        # Build current profile summary
        profile_parts = []
        if buyer.get("budget_min") and buyer.get("budget_max"):
            profile_parts.append(f"Budget: ${buyer['budget_min']:,} - ${buyer['budget_max']:,}")
        if buyer.get("location"):
            profile_parts.append(f"Location: {buyer['location']}")
        if buyer.get("bedrooms"):
            profile_parts.append(f"Bedrooms: {buyer['bedrooms']}+")
        if buyer.get("bathrooms"):
            profile_parts.append(f"Bathrooms: {buyer['bathrooms']}+")
        must_haves = buyer.get("must_have_features") or []
        if must_haves:
            profile_parts.append(f"Must-haves: {', '.join(must_haves)}")
        dealbreakers = buyer.get("dealbreakers") or []
        if dealbreakers:
            profile_parts.append(f"Dealbreakers: {', '.join(dealbreakers)}")
        
        profile_summary = "\n".join(profile_parts) or "No profile data yet"
        
        prompt = f"""You are parsing a real estate buyer profile edit request.

Current profile for {buyer.get('name', 'Buyer')}:
{profile_summary}

User request: "{edit_text}"

Extract the changes as a JSON array. Each change should have:
- "field": one of ["budgetMin", "budgetMax", "bedrooms", "bathrooms", "location", "mustHaveFeatures", "dealbreakers", "homeType"]
- "action": one of ["update", "add", "remove"]
- "oldValue": current value (or null)
- "newValue": new value

For budget changes like "increase by $50K", calculate the new value from the current value.
For "add pool to must-haves", use action "add" with field "mustHaveFeatures".

Return ONLY a JSON array, no other text. Example:
[{{"field": "budgetMax", "action": "update", "oldValue": "$960,000", "newValue": "$1,010,000"}}, {{"field": "mustHaveFeatures", "action": "add", "oldValue": null, "newValue": "pool"}}]"""

        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=500
            )
            
            content = response.choices[0].message.content.strip()
            
            # Handle markdown code blocks
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
                content = content.strip()
            
            changes = json.loads(content)
            return changes if isinstance(changes, list) else []
            
        except Exception as e:
            logger.error(f"OpenAI parse changes failed: {e}")
            raise

    def _get_agent_name(self) -> Optional[str]:
        """Get agent's name."""
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT first_name, last_name FROM agents WHERE id = %s",
                    (self.agent_id,)
                )
                row = fetchone_dict(cur)
                if row:
                    first = row.get("first_name", "")
                    last = row.get("last_name", "")
                    return f"{first} {last}".strip() or None
                return None
