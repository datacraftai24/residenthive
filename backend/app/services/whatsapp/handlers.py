"""
WhatsApp Action Handlers

Executes actions based on parsed intents, calling existing backend APIs
and formatting responses for WhatsApp.

Layer 1 intents are routed directly to handlers.
Layer 2 (UNKNOWN) intents are routed to the coordinator agent.

Each handler:
1. Validates the request
2. Calls existing backend APIs
3. Updates session state
4. Returns formatted response
"""

import asyncio
import json
import logging
from typing import Dict, Any, Optional, List

from .session import SessionManager, AgentSession, SessionState
from .intent import IntentParser, Intent, IntentType, resolve_buyer_from_intent, run_agent, AgentResult
from .messages import MessageBuilder
from .buyer_codes import (
    get_buyer_by_code,
    get_buyers_by_name,
    resolve_entity_reference,
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

        Layer 1: Pattern matching (buttons, codes, obvious commands) -> instant
        Layer 2: Coordinator Agent (Gemini 3 Flash) for natural language

        Args:
            message: Message text or button/list ID
            input_type: "text", "button", or "list"

        Returns:
            Response dict for WhatsAppClient
        """
        try:
            # Save inbound message to history
            self.session.add_message("user", message)

            # Get buyers for context
            buyers = self._get_all_buyers()

            # Get active buyer if in context
            active_buyer = None
            if self.session.active_buyer_id:
                active_buyer = self._get_buyer_by_id(self.session.active_buyer_id)

            # Parse intents via Layer 1 (pattern matching only)
            intents = self.intent_parser.parse_multi(
                message=message,
                input_type=input_type,
                session_state=self.session.state.value,
                active_buyer=active_buyer,
                buyers=buyers,
            )

            intent = intents[0]

            # ── Layer 1 matched → route directly ──
            if intent.type != IntentType.UNKNOWN:
                # Resolve buyer references
                for i, it in enumerate(intents):
                    intents[i] = resolve_buyer_from_intent(it, self.agent_id, active_buyer)

                if len(intents) == 1:
                    intent = intents[0]
                    logger.info(
                        f"[L1] Intent: {intent.type.value}, "
                        f"buyer_ref={intent.buyer_reference}, buyer_id={intent.buyer_id}"
                    )
                    response = await self._route_intent(intent, active_buyer, buyers)
                    response["intent"] = intent.type.value
                else:
                    intent_types = ", ".join(i.type.value for i in intents)
                    logger.info(f"[L1] Multi-intent ({len(intents)} steps): {intent_types}")
                    response = await self.preview_action_sequence(intents)
                    response["intent"] = "action_sequence"

            # ── Layer 2: Coordinator Agent ──
            else:
                logger.info(f"[L2] Routing to coordinator agent: {message[:100]}")
                agent_result = await run_agent(message, self.session)

                # Apply pending action from agent — sync to self.session
                # so the final SessionManager.save() doesn't overwrite it
                if agent_result.pending_action:
                    updated = await SessionManager.set_pending_action(
                        self.phone,
                        agent_result.pending_action["type"],
                        agent_result.pending_action["data"],
                    )
                    if updated:
                        self.session.pending_action = updated.pending_action
                        self.session.state = updated.state

                # Build WhatsApp message from agent result
                if agent_result.actions:
                    response = MessageBuilder.buttons(agent_result.text, agent_result.actions)
                else:
                    response = MessageBuilder.text(agent_result.text)
                response["intent"] = "agent"

            # Save outbound to history
            self.session.add_message("assistant", response.get("body", ""))
            await SessionManager.save(self.session)

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
            IntentType.APPROVE_REPORT: lambda: self._handle_approve_report(),
            IntentType.REJECT_REPORT: lambda: self._handle_reject_report(),
            IntentType.SEND_OUTREACH: lambda: self._handle_send_outreach(),
            IntentType.APPROVE_OUTREACH: lambda: self._handle_approve_outreach(),
            IntentType.REJECT_OUTREACH: lambda: self._handle_reject_outreach(),
            IntentType.PROCESS_LEAD: lambda: self._handle_process_lead(intent),
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
        
        # Get entity by ID or reference (searches both buyers and leads)
        entity = None
        if intent.buyer_id:
            entity = self._get_buyer_by_id(intent.buyer_id)
            if entity:
                entity["entity_type"] = "buyer"
        elif intent.buyer_reference:
            matches = resolve_entity_reference(self.agent_id, intent.buyer_reference)
            if len(matches) == 1:
                entity = matches[0]
            elif len(matches) > 1:
                return MessageBuilder.disambiguation(matches, intent.buyer_reference)

        if not entity:
            return MessageBuilder.text(
                f"I couldn't find a buyer or lead matching \"{intent.buyer_reference}\".\n\n"
                "Try typing their full name or code (e.g., SC1)."
            )

        entity_type = entity.get("entity_type", "buyer")
        code = entity.get("whatsapp_code") or entity.get("code") or ""
        name = entity.get("name") or entity.get("extracted_name") or "Unknown"

        if entity_type == "lead":
            # Enter lead context
            from .buyer_codes import assign_code_to_lead
            if not code:
                code = assign_code_to_lead(entity["id"], self.agent_id, name)
            self.session.set_lead_context(entity["id"], code, name)
            await SessionManager.save(self.session)
            return MessageBuilder.lead_context_entered(entity)
        else:
            # Enter buyer context
            if not code:
                code = assign_code_to_buyer(entity["id"], self.agent_id, name)
                entity["whatsapp_code"] = code
            self.session.set_buyer_context(entity["id"], code, name)
            await SessionManager.save(self.session)
            return MessageBuilder.buyer_context_entered(entity)
    
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

            # Store pending approval instead of sending directly
            await SessionManager.set_pending_action(
                self.phone,
                "approve_report",
                {
                    "share_id": share_id,
                    "share_url": full_url,
                    "buyer_id": active_buyer["id"],
                    "buyer_name": active_buyer.get("name", "Buyer"),
                    "buyer_email": active_buyer.get("email"),
                    "listing_count": listing_count,
                }
            )

            return MessageBuilder.report_approval_request(
                buyer_name=active_buyer.get("name", "Buyer"),
                share_url=full_url,
                listing_count=listing_count,
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
    # Report Approval Handlers
    # =========================================================================

    async def _handle_approve_report(self) -> Dict[str, Any]:
        """Approve and send the pending report to the buyer."""
        pending = self.session.pending_action
        if not pending or pending.get("type") != "approve_report":
            return MessageBuilder.text("No report pending approval.")

        data = pending.get("data", {})
        share_id = data.get("share_id")
        buyer_email = data.get("buyer_email")
        buyer_name = data.get("buyer_name", "Buyer")

        if not buyer_email:
            await SessionManager.clear_pending_action(self.phone)
            return MessageBuilder.text(
                f"{buyer_name} doesn't have an email address.\n"
                "Add their email first, then regenerate the report."
            )

        try:
            from ...routers.buyer_reports import send_buyer_report_email, SendReportEmailRequest

            request = SendReportEmailRequest(to_email=buyer_email)
            send_buyer_report_email(share_id, request, agent_id=self.agent_id)

            await SessionManager.clear_pending_action(self.phone)

            return MessageBuilder.buttons(
                f"📧 Report approved & sent to *{buyer_name}*!\n\n"
                f"Delivered to: {buyer_email}\n\n"
                "You'll be notified when they view it or leave notes.",
                [
                    {"id": "view_buyers", "title": "View Buyers"},
                    {"id": "done", "title": "Done"}
                ]
            )

        except Exception as e:
            logger.error(f"Failed to send approved report: {e}", exc_info=True)
            await SessionManager.clear_pending_action(self.phone)
            return MessageBuilder.error(
                f"Failed to send report to {buyer_email}. Please try again."
            )

    async def _handle_reject_report(self) -> Dict[str, Any]:
        """Reject the pending report."""
        pending = self.session.pending_action
        if not pending or pending.get("type") != "approve_report":
            return MessageBuilder.text("No report pending approval.")

        buyer_name = pending.get("data", {}).get("buyer_name", "Buyer")
        await SessionManager.clear_pending_action(self.phone)

        return MessageBuilder.buttons(
            f"❌ Report for *{buyer_name}* was not sent.\n\n"
            "Would you like to adjust their criteria and try again?",
            [
                {"id": "edit", "title": "Edit Profile"},
                {"id": "search", "title": "New Search"},
                {"id": "done", "title": "Done"}
            ]
        )

    # =========================================================================
    # Lead Processing & Outreach Handlers
    # =========================================================================

    async def _handle_process_lead(self, intent: Intent) -> Dict[str, Any]:
        """Process raw lead text — return summary immediately, fire outreach as background task.

        Bug #1 fix: The old implementation awaited generate_lead_outreach() inline,
        causing webhook timeouts (~30s). Now we return the lead summary in <5s and
        fire the outreach generation as a background task that pushes a notification
        when ready.
        """
        raw_text = intent.params.get("raw_text", intent.raw_text)
        source = intent.params.get("source", "unknown")

        try:
            from .agent import process_lead_from_text
            from .buyer_codes import assign_code_to_lead

            lead_data = process_lead_from_text(raw_text, source, self.agent_id)
            if not lead_data:
                return MessageBuilder.error(
                    "I couldn't process that as a lead. Please try again or use the web dashboard."
                )

            lead_id = lead_data["lead_id"]
            lead_name = lead_data.get("name") or "Lead"
            lead_email = lead_data.get("email")

            # Assign WhatsApp code to the new lead
            assign_code_to_lead(lead_id, self.agent_id, lead_name)

            # Fire outreach generation as BACKGROUND task (Bug #1 fix)
            asyncio.create_task(
                self._background_generate_outreach(lead_id, lead_name, lead_email)
            )

            # Return lead summary immediately (~2s response)
            return MessageBuilder.lead_processed(lead_data)

        except Exception as e:
            logger.error(f"Failed to process lead: {e}", exc_info=True)
            return MessageBuilder.error(
                "Something went wrong processing that lead. Please try again."
            )

    async def _background_generate_outreach(self, lead_id: int, lead_name: str, lead_email: str):
        """Background task: generate outreach report and push approval notification."""
        try:
            from ...routers.leads import generate_lead_outreach
            from .notifications import on_lead_outreach_ready

            result = await generate_lead_outreach(
                lead_id=lead_id,
                send_email=False,
                agent_id=self.agent_id,
                _notify_whatsapp=False,
            )

            share_id = result.get("reportShareId")
            if share_id:
                await on_lead_outreach_ready(
                    self.agent_id, lead_name, lead_email, lead_id, share_id
                )
                logger.info(f"Background outreach ready for lead {lead_id}: {share_id}")
            else:
                logger.warning(f"Background outreach returned no share_id for lead {lead_id}")

        except Exception as e:
            logger.error(f"Background outreach failed for lead {lead_id}: {e}", exc_info=True)

    async def _handle_send_outreach(self) -> Dict[str, Any]:
        """Generate outreach report for a lead (without sending email yet)."""
        pending = self.session.pending_action
        if not pending or pending.get("type") != "send_outreach":
            return MessageBuilder.text("No lead pending. Process a lead first.")

        data = pending.get("data", {})
        lead_id = data.get("lead_id")
        lead_name = data.get("lead_name", "Lead")
        lead_email = data.get("lead_email")

        if not lead_id:
            await SessionManager.clear_pending_action(self.phone)
            return MessageBuilder.error("Missing lead information. Please try again.")

        try:
            from ...routers.leads import generate_lead_outreach

            # Generate report WITHOUT sending email
            result = await generate_lead_outreach(
                lead_id=lead_id,
                send_email=False,
                agent_id=self.agent_id,
                _notify_whatsapp=False,
            )

            share_id = result.get("reportShareId")
            report_url = result.get("fullReportUrl", "")
            listing_count = result.get("propertiesIncluded", 0)

            if not share_id:
                await SessionManager.clear_pending_action(self.phone)
                return MessageBuilder.error(
                    f"Could not generate outreach report for {lead_name}. "
                    "Please try from the web dashboard."
                )

            # Store approval pending action
            await SessionManager.set_pending_action(
                self.phone,
                "approve_outreach",
                {
                    "share_id": share_id,
                    "share_url": report_url,
                    "lead_id": lead_id,
                    "lead_name": lead_name,
                    "lead_email": lead_email,
                    "listing_count": listing_count,
                }
            )

            return MessageBuilder.outreach_approval_request(
                lead_name=lead_name,
                share_url=report_url,
                listing_count=listing_count,
            )

        except Exception as e:
            logger.error(f"Failed to generate outreach report: {e}", exc_info=True)
            await SessionManager.clear_pending_action(self.phone)
            return MessageBuilder.error(
                f"Failed to generate outreach report for {lead_name}. Please try again."
            )

    async def _handle_approve_outreach(self) -> Dict[str, Any]:
        """Approve and send the pending outreach report to the lead."""
        pending = self.session.pending_action
        if not pending or pending.get("type") != "approve_outreach":
            return MessageBuilder.text("No outreach report pending approval.")

        data = pending.get("data", {})
        share_id = data.get("share_id")
        lead_email = data.get("lead_email")
        lead_name = data.get("lead_name", "Lead")

        if not lead_email:
            await SessionManager.clear_pending_action(self.phone)
            return MessageBuilder.text(
                f"No email address found for {lead_name}.\n"
                "Add their email on the web dashboard first, then regenerate."
            )

        try:
            from ...routers.buyer_reports import send_buyer_report_email, SendReportEmailRequest

            request = SendReportEmailRequest(to_email=lead_email)
            send_buyer_report_email(share_id, request, agent_id=self.agent_id)

            await SessionManager.clear_pending_action(self.phone)

            return MessageBuilder.buttons(
                f"📧 Outreach report sent to *{lead_name}*!\n\n"
                f"Delivered to: {lead_email}\n\n"
                "You'll be notified when they view it or engage.",
                [
                    {"id": "view_buyers", "title": "View Buyers"},
                    {"id": "done", "title": "Done"}
                ]
            )

        except Exception as e:
            logger.error(f"Failed to send outreach report: {e}", exc_info=True)
            await SessionManager.clear_pending_action(self.phone)
            return MessageBuilder.error(
                f"Failed to send outreach report to {lead_email}. Please try again."
            )

    async def _handle_reject_outreach(self) -> Dict[str, Any]:
        """Reject the pending outreach report."""
        pending = self.session.pending_action
        if not pending or pending.get("type") != "approve_outreach":
            return MessageBuilder.text("No outreach report pending approval.")

        lead_name = pending.get("data", {}).get("lead_name", "Lead")
        await SessionManager.clear_pending_action(self.phone)

        return MessageBuilder.buttons(
            f"❌ Outreach report for *{lead_name}* was not sent.\n\n"
            "You can generate a new one from the web dashboard.",
            [
                {"id": "view_buyers", "title": "View Buyers"},
                {"id": "done", "title": "Done"}
            ]
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
            from ...routers.nlp import extract_profile, ExtractRequest
            
            result = extract_profile(ExtractRequest(input=raw_text))
            # extract_profile returns fields at the top level, not nested under "profile"
            extracted = result.get("profile") or result
            
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
            if action_type == "create_profile":
                return await self._execute_create_profile(action_data)
            elif action_type == "create_buyer":
                return await self._execute_create_buyer(action_data)
            elif action_type == "edit_buyer":
                return await self._execute_edit_buyer(action_data)
            elif action_type == "edit_entity":
                return await self._execute_edit_entity(action_data)
            elif action_type == "approve_report":
                return await self._handle_approve_report()
            elif action_type == "send_outreach":
                return await self._handle_send_outreach()
            elif action_type == "approve_outreach":
                return await self._handle_approve_outreach()
            elif action_type == "convert_lead":
                return await self._execute_convert_lead(action_data)
            elif action_type == "action_sequence":
                return await self._execute_action_sequence(action_data)
            else:
                return MessageBuilder.error(f"Unknown action type: {action_type}")

        finally:
            await SessionManager.clear_pending_action(self.phone)
    
    async def _execute_create_profile(self, action_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a unified profile (profile_type='lead') after agent confirmation."""
        fields = action_data.get("extracted_fields", {})
        extracted = fields.get("extracted", {})
        classification = fields.get("classification", {})
        agent_id = action_data.get("agent_id", self.agent_id)

        try:
            from ...routers.conversational import _format_budget_display
            from .buyer_codes import assign_code_to_buyer

            name = extracted.get("name") or "Unknown"
            budget_min = extracted.get("budgetMin")
            budget_max = extracted.get("budgetMax")
            budget_display = _format_budget_display(budget_min, budget_max) if (budget_min or budget_max) else extracted.get("budget")

            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO buyer_profiles (
                            agent_id, name, email, phone, location,
                            budget, budget_min, budget_max,
                            bedrooms, bathrooms, home_type,
                            profile_type, intent_score, lead_source, lead_type,
                            property_url, property_address,
                            property_listing_id, property_list_price,
                            property_bedrooms, property_bathrooms, property_sqft,
                            suggested_message, hints, lead_raw_input,
                            extraction_confidence,
                            raw_input, input_method, created_by_method,
                            created_at
                        ) VALUES (
                            %s, %s, %s, %s, %s,
                            %s, %s, %s,
                            %s, %s, %s,
                            'lead', %s, %s, %s,
                            %s, %s,
                            %s, %s,
                            %s, %s, %s,
                            %s, %s, %s,
                            %s,
                            %s, 'whatsapp', 'lead',
                            NOW()
                        )
                        RETURNING id
                    """, (
                        agent_id, name,
                        extracted.get("email"), extracted.get("phone"),
                        extracted.get("location"),
                        budget_display, budget_min, budget_max,
                        extracted.get("bedrooms"), extracted.get("bathrooms"),
                        extracted.get("homeType"),
                        fields.get("intent_score"),
                        fields.get("source"),
                        classification.get("leadType"),
                        fields.get("property_url"),
                        fields.get("property_address"),
                        fields["property_details"].get("listingId") if fields.get("property_details") else None,
                        fields["property_details"].get("listPrice") if fields.get("property_details") else None,
                        fields["property_details"].get("bedrooms") if fields.get("property_details") else None,
                        str(fields["property_details"].get("bathrooms")) if fields.get("property_details") and fields["property_details"].get("bathrooms") else None,
                        fields["property_details"].get("sqft") if fields.get("property_details") else None,
                        fields.get("suggested_message"),
                        json.dumps(extracted.get("hints", [])),
                        fields.get("raw_text"),
                        fields.get("extraction_confidence"),
                        fields.get("raw_text"),
                    ))
                    row = fetchone_dict(cur)
                    profile_id = row["id"]

            # Assign whatsapp code
            code = assign_code_to_buyer(profile_id, agent_id, name)

            # Set profile context
            self.session.set_buyer_context(profile_id, code, name)
            await SessionManager.save(self.session)

            # Fire report generation in background
            asyncio.create_task(
                self._background_generate_report(profile_id, name, extracted.get("email"), code)
            )

            return MessageBuilder.buttons(
                f"✅ Created profile for *{name}* ({code})\n\n"
                f"Generating report...",
                [{"id": "done", "title": "Done"}],
            )

        except Exception as e:
            logger.error(f"Create profile failed: {e}", exc_info=True)
            return MessageBuilder.error("Failed to create profile. Please try again.")

    async def _background_generate_report(self, profile_id: int, name: str, email: str, code: str):
        """Background: generate report for newly created profile and notify agent."""
        try:
            from ...routers.buyer_reports import create_buyer_report, CreateBuyerReportRequest
            from ...routers.search import agent_search_photos, agent_search_location
            from ...routers.listings import listings_search, _load_profile
            from ...routers.search import _map_to_agent_listing
            from ..search_context_store import generate_search_id, store_search_context
            from .notifications import on_lead_outreach_ready
            import os

            # Step 1: Search for properties
            profile = _load_profile(profile_id)
            result = listings_search({"profileId": profile_id, "profile": {}})
            listings = _map_to_agent_listing(result)

            if not listings:
                logger.warning(f"[BG REPORT] No listings found for profile {profile_id}")
                return

            # Step 2: Store search context
            search_id = generate_search_id()
            store_search_context(search_id, profile, listings)

            # Step 3: Run photo + location analysis
            try:
                agent_search_photos(searchId=search_id)
            except Exception as e:
                logger.warning(f"[BG REPORT] Photo analysis failed (non-blocking): {e}")
            try:
                await agent_search_location(searchId=search_id)
            except Exception as e:
                logger.warning(f"[BG REPORT] Location analysis failed (non-blocking): {e}")

            # Step 4: Generate report
            report = create_buyer_report(
                CreateBuyerReportRequest(
                    searchId=search_id,
                    profileId=profile_id,
                    allowPartial=True,
                ),
                agent_id=self.agent_id,
            )

            share_id = report.get("shareId")
            if share_id:
                await on_lead_outreach_ready(
                    self.agent_id, name, email, profile_id, share_id
                )
                logger.info(f"[BG REPORT] Report ready for profile {profile_id}: {share_id}")

        except Exception as e:
            logger.error(f"[BG REPORT] Failed for profile {profile_id}: {e}", exc_info=True)

    async def _execute_create_buyer(self, action_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute buyer creation after confirmation."""
        extracted = action_data.get("extracted_profile", {})
        
        try:
            from ...routers.profiles import create_profile
            from ...models import BuyerProfileCreate
            
            # Map extracted to create request
            profile_data = BuyerProfileCreate(
                name=extracted.get("name") or "Unknown",
                email=extracted.get("email") or "placeholder@residenthive.com",
                phone=extracted.get("phone"),
                location=extracted.get("location") or "",
                budget=extracted.get("budget") or "",
                budgetMin=extracted.get("budgetMin"),
                budgetMax=extracted.get("budgetMax"),
                homeType=extracted.get("homeType") or "any",
                bedrooms=extracted.get("bedrooms") or 3,
                bathrooms=str(extracted.get("bathrooms") or "2"),
                mustHaveFeatures=extracted.get("mustHaveFeatures") or [],
                dealbreakers=extracted.get("dealbreakers") or [],
                niceToHaves=extracted.get("niceToHaves") or [],
                preferredAreas=extracted.get("preferredAreas") or [],
                lifestyleDrivers=extracted.get("lifestyleDrivers") or [],
                specialNeeds=extracted.get("specialNeeds") or [],
                budgetFlexibility=extracted.get("budgetFlexibility"),
                locationFlexibility=extracted.get("locationFlexibility"),
                timingFlexibility=extracted.get("timingFlexibility"),
                emotionalContext=extracted.get("emotionalContext"),
                minSqft=extracted.get("minSqft"),
                maxSqft=extracted.get("maxSqft"),
                minYearBuilt=extracted.get("minYearBuilt"),
                maxYearBuilt=extracted.get("maxYearBuilt"),
                minGarageSpaces=extracted.get("minGarageSpaces"),
                maxMaintenanceFee=extracted.get("maxMaintenanceFee"),
                minLotSizeSqft=extracted.get("minLotSizeSqft"),
                maxDaysOnMarket=extracted.get("maxDaysOnMarket"),
                rawInput=extracted.get("rawInput") or "",
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
            
            # Build rich summary
            summary_lines = [f"✅ Created *{result.name}* ({code})", ""]
            if extracted.get("email"):
                summary_lines.append(f"📧 {extracted['email']}")
            if extracted.get("phone"):
                summary_lines.append(f"📱 {extracted['phone']}")
            if extracted.get("location"):
                summary_lines.append(f"📍 {extracted['location']}")
            if extracted.get("budgetMin") and extracted.get("budgetMax"):
                summary_lines.append(f"💰 ${extracted['budgetMin']:,} - ${extracted['budgetMax']:,}")
            if extracted.get("bedrooms"):
                summary_lines.append(f"🛏️ {extracted['bedrooms']}+ bedrooms")
            if extracted.get("homeType") and extracted["homeType"] != "any":
                summary_lines.append(f"🏠 {extracted['homeType']}")
            must_haves = extracted.get("mustHaveFeatures", [])
            if must_haves:
                summary_lines.append(f"✓ {', '.join(must_haves[:5])}")
            summary_lines.append("")
            summary_lines.append("Ready to search!")

            return MessageBuilder.buttons(
                "\n".join(summary_lines),
                [
                    {"id": "search", "title": "Search Now"},
                    {"id": "profile", "title": "View Profile"},
                    {"id": "done", "title": "Back to List"}
                ]
            )
            
        except Exception as e:
            logger.error(f"Create buyer failed: {e}", exc_info=True)
            return MessageBuilder.error("Failed to create buyer. Please try again.")
    
    async def _execute_convert_lead(self, action_data: Dict[str, Any]) -> Dict[str, Any]:
        """Convert a lead to buyer profile, then continue with original intent (search/report)."""
        lead_id = action_data.get("lead_id")
        original_intent = action_data.get("intent", "search")

        try:
            from ...routers.leads import _convert_lead_to_profile_internal

            # Get lead data
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT * FROM leads WHERE id = %s AND agent_id = %s",
                        (lead_id, self.agent_id),
                    )
                    lead_row = fetchone_dict(cur)

            if not lead_row:
                return MessageBuilder.error("Lead not found.")

            result = _convert_lead_to_profile_internal(lead_id, self.agent_id, lead_row)
            profile_id = result.get("profileId")

            if not profile_id:
                return MessageBuilder.error("Failed to convert lead to buyer profile.")

            lead_name = lead_row.get("extracted_name") or "Lead"

            # Update session to buyer context
            from .buyer_codes import assign_code_to_buyer
            code = assign_code_to_buyer(profile_id, self.agent_id, lead_name)
            self.session.set_buyer_context(profile_id, code, lead_name)
            await SessionManager.save(self.session)

            # Auto-continue with original intent
            if original_intent in ("search", "search_and_report"):
                from .intent import run_agent
                continuation_msg = (
                    f"report for {lead_name}" if original_intent == "search_and_report"
                    else f"search for {lead_name}"
                )
                agent_result = await run_agent(continuation_msg, self.session)
                return MessageBuilder.text(
                    f"Converted *{lead_name}* to buyer profile ({code}).\n\n{agent_result.text}"
                ) if not agent_result.actions else MessageBuilder.buttons(
                    f"Converted *{lead_name}* to buyer profile ({code}).\n\n{agent_result.text}",
                    agent_result.actions,
                )

            return MessageBuilder.buttons(
                f"Converted *{lead_name}* to buyer profile ({code}).\n\nWhat would you like to do?",
                [
                    {"id": "search", "title": "Search Now"},
                    {"id": "profile", "title": "View Profile"},
                    {"id": "done", "title": "Done"},
                ],
            )

        except Exception as e:
            logger.error(f"Convert lead failed: {e}", exc_info=True)
            return MessageBuilder.error("Failed to convert lead. Please try again.")

    @staticmethod
    def _sanitize_change_value(field: str, value):
        """Ensure change values have the correct type for the database."""
        if value is None:
            return value
        # Budget and numeric fields must be integers
        if field in ("budgetMin", "budgetMax", "bedrooms", "bathrooms", "minSqft", "maxSqft", "minYearBuilt", "maxYearBuilt", "minGarageSpaces", "maxMaintenanceFee", "minLotSizeSqft", "maxDaysOnMarket"):
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
            
            # Show old → new for each changed field
            change_lines = [f"✅ Updated *{result.get('name')}*", ""]
            for change in changes:
                field = change.get("field", "")
                old_val = change.get("oldValue", "—")
                new_val = change.get("newValue", "—")
                action = change.get("action", "update")
                if action == "add":
                    change_lines.append(f"• Added {new_val} to {field}")
                elif action == "remove":
                    change_lines.append(f"• Removed {old_val} from {field}")
                else:
                    change_lines.append(f"• {field}: {old_val} → {new_val}")

            return MessageBuilder.buttons(
                "\n".join(change_lines),
                [
                    {"id": "search", "title": "Search Again"},
                    {"id": "profile", "title": "View Profile"},
                    {"id": "done", "title": "Done"}
                ]
            )
            
        except Exception as e:
            logger.error(f"Edit buyer failed: {e}", exc_info=True)
            return MessageBuilder.error("Failed to update buyer. Please try again.")
    
    # Field mapping from agent-facing names to lead table columns
    LEAD_FIELD_MAP = {
        "budgetMin": "extracted_budget_min",
        "budgetMax": "extracted_budget_max",
        "location": "extracted_location",
        "email": "extracted_email",
        "phone": "extracted_phone",
        "bedrooms": "extracted_bedrooms",
        "name": "extracted_name",
        "homeType": "extracted_home_type",
    }

    # Mapping from agent-facing names to buyer_profiles columns for sync
    LEAD_TO_BUYER_SYNC = {
        "budgetMin": "budget_min",
        "budgetMax": "budget_max",
        "location": "location",
        "email": "email",
        "phone": "phone",
        "bedrooms": "bedrooms",
        "name": "name",
        "homeType": "home_type",
    }

    async def _execute_edit_entity(self, action_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute entity edit after confirmation (handles both leads and buyers)."""
        entity_id = action_data.get("entity_id")
        entity_type = action_data.get("entity_type", "buyer")
        changes_description = action_data.get("changes_description", "")

        if entity_type == "buyer":
            # Re-use existing buyer edit flow: parse changes then apply
            buyer = self._get_buyer_by_id(entity_id)
            if not buyer:
                return MessageBuilder.error("Buyer not found.")

            try:
                changes = await self._parse_edit_changes(buyer, changes_description)
                if not changes:
                    return MessageBuilder.text(
                        "I couldn't parse the changes. Try being more specific."
                    )
                return await self._execute_edit_buyer({"buyer_id": entity_id, "changes": changes})
            except Exception as e:
                logger.error(f"Edit entity (buyer) failed: {e}", exc_info=True)
                return MessageBuilder.error("Failed to update buyer.")

        else:
            # Lead edit: parse changes description and update lead table directly
            try:
                changes = await self._parse_lead_edit_changes(entity_id, changes_description)
                if not changes:
                    return MessageBuilder.text(
                        "I couldn't parse the changes for this lead."
                    )

                with get_conn() as conn:
                    with conn.cursor() as cur:
                        # Sanitize all values first
                        sanitized = {}
                        for field_name, new_value in changes.items():
                            sanitized[field_name] = self._sanitize_change_value(field_name, new_value)

                        # Update lead table
                        for field_name, new_value in sanitized.items():
                            col = self.LEAD_FIELD_MAP.get(field_name, field_name)
                            cur.execute(
                                f"UPDATE leads SET {col} = %s WHERE id = %s AND agent_id = %s",
                                (new_value, entity_id, self.agent_id),
                            )

                        # If budget changed, update the display text on leads
                        budget_changed = "budgetMin" in sanitized or "budgetMax" in sanitized
                        display = None
                        if budget_changed:
                            from ...routers.conversational import _format_budget_display
                            cur.execute(
                                "SELECT extracted_budget_min, extracted_budget_max FROM leads WHERE id = %s",
                                (entity_id,),
                            )
                            row = fetchone_dict(cur)
                            if row:
                                display = _format_budget_display(
                                    row["extracted_budget_min"], row["extracted_budget_max"]
                                )
                                cur.execute(
                                    "UPDATE leads SET extracted_budget = %s WHERE id = %s AND agent_id = %s",
                                    (display, entity_id, self.agent_id),
                                )

                        # Sync changes to buyer_profiles if one exists
                        cur.execute(
                            "SELECT id FROM buyer_profiles WHERE parent_lead_id = %s AND agent_id = %s",
                            (entity_id, self.agent_id),
                        )
                        bp_row = fetchone_dict(cur)
                        if bp_row:
                            bp_id = bp_row["id"]
                            for field_name, new_value in sanitized.items():
                                bp_col = self.LEAD_TO_BUYER_SYNC.get(field_name)
                                if bp_col:
                                    cur.execute(
                                        f"UPDATE buyer_profiles SET {bp_col} = %s WHERE id = %s",
                                        (new_value, bp_id),
                                    )
                            if budget_changed and display:
                                cur.execute(
                                    "UPDATE buyer_profiles SET budget = %s WHERE id = %s",
                                    (display, bp_id),
                                )

                lead_name = self.session.active_lead_name or f"Lead #{entity_id}"
                change_lines = [f"✅ Updated lead *{lead_name}*", ""]
                for field_name, new_value in sanitized.items():
                    change_lines.append(f"• {field_name} → {new_value}")

                return MessageBuilder.buttons(
                    "\n".join(change_lines),
                    [
                        {"id": "done", "title": "Done"},
                    ],
                )

            except Exception as e:
                logger.error(f"Edit entity (lead) failed: {e}", exc_info=True)
                return MessageBuilder.error("Failed to update lead.")

    async def _parse_lead_edit_changes(self, lead_id: int, changes_description: str) -> Dict[str, Any]:
        """Parse natural language changes for a lead into field:value pairs."""
        import json as _json
        import os

        # Get current lead data for context
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM leads WHERE id = %s AND agent_id = %s",
                    (lead_id, self.agent_id),
                )
                lead = fetchone_dict(cur)

        if not lead:
            return {}

        from google import genai as _genai
        from google.genai import types as _types

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {}

        client = _genai.Client(api_key=api_key)
        model = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

        prompt = f"""Parse this edit request for a real estate lead profile into JSON key:value pairs.

Current lead:
- Name: {lead.get('extracted_name')}
- Email: {lead.get('extracted_email')}
- Phone: {lead.get('extracted_phone')}
- Location: {lead.get('extracted_location')}
- Budget: {lead.get('extracted_budget_min')} - {lead.get('extracted_budget_max')}
- Bedrooms: {lead.get('extracted_bedrooms')}

Edit request: "{changes_description}"

Return ONLY a JSON object with the fields to update. Keys must be one of: budgetMin, budgetMax, location, email, phone, bedrooms, name, homeType, minSqft, maxSqft, minYearBuilt, maxYearBuilt, minGarageSpaces, maxMaintenanceFee, minLotSizeSqft, maxDaysOnMarket.
For budget changes like "increase by $50K", calculate the new value.
Example: {{"budgetMax": 850000, "email": "new@email.com"}}"""

        try:
            resp = client.models.generate_content(
                model=model,
                contents=[_types.Content(role="user", parts=[_types.Part(text=prompt)])],
                config=_types.GenerateContentConfig(temperature=0.1),
            )
            text = resp.candidates[0].content.parts[0].text.strip()
            # Strip markdown code blocks
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()
            return _json.loads(text)
        except Exception as e:
            logger.error(f"Failed to parse lead edit changes: {e}")
            return {}

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

        # If Gemini returned a text response (conversational), show it
        gemini_text = intent.params.get("gemini_text")
        if gemini_text:
            return MessageBuilder.text(gemini_text)

        # Fallback help message
        if self.session.is_in_buyer_context():
            return MessageBuilder.text(
                f"I didn't understand that.\n\n"
                f"Currently focused on: {self.session.active_buyer_name}\n\n"
                "Try 'search', 'report', 'edit', or 'done'.\n"
                "Type 'help' for all commands."
            )

        return MessageBuilder.help_message()
    
    # =========================================================================
    # Multi-Action Sequence
    # =========================================================================

    # Intents that indicate a step failure severe enough to abort the sequence
    _ABORT_ON_ERROR_INTENTS = {
        IntentType.SELECT_BUYER,
        IntentType.SEARCH,
        IntentType.GENERATE_REPORT,
    }

    _STEP_SUMMARY_TEMPLATES = {
        IntentType.SELECT_BUYER: "Selected {buyer}",
        IntentType.SEARCH: "Searched for properties",
        IntentType.GENERATE_REPORT: "Generated buyer report",
        IntentType.SEND_REPORT: "Sent report to buyer",
        IntentType.VIEW_PROFILE: "Viewed buyer profile",
        IntentType.VIEW_BUYERS: "Listed all buyers",
        IntentType.EDIT_BUYER: "Updated buyer profile",
        IntentType.CREATE_BUYER: "Created new buyer",
    }

    async def preview_action_sequence(
        self,
        intents: List[Intent],
    ) -> Dict[str, Any]:
        """
        Build a human-readable preview of a planned multi-action sequence,
        store it in ``pending_action``, and return a confirmation message.
        """
        # Resolve the primary buyer name for display
        buyer_name = None
        buyer_email = None
        for intent in intents:
            if intent.buyer_reference:
                matches = resolve_entity_reference(self.agent_id, intent.buyer_reference)
                if len(matches) == 1:
                    buyer_name = matches[0].get("name") or matches[0].get("extracted_name")
                    buyer_email = matches[0].get("email") or matches[0].get("extracted_email")
                break
        if not buyer_name and self.session.active_buyer_name:
            buyer_name = self.session.active_buyer_name
            if self.session.active_buyer_id:
                active = self._get_buyer_by_id(self.session.active_buyer_id)
                if active:
                    buyer_email = active.get("email")

        # Serialise intents for storage in pending_action
        serialised_intents = []
        for intent in intents:
            serialised_intents.append({
                "type": intent.type.value,
                "buyer_reference": intent.buyer_reference,
                "buyer_id": intent.buyer_id,
                "params": intent.params,
                "raw_text": intent.raw_text,
                "confidence": intent.confidence,
            })

        await SessionManager.set_pending_action(
            self.phone,
            "action_sequence",
            {"intents": serialised_intents},
        )

        # Build preview message
        intent_dicts = [{"type": i.type.value, "buyer_reference": i.buyer_reference} for i in intents]
        return MessageBuilder.action_sequence_preview(
            intent_dicts,
            buyer_name=buyer_name,
            buyer_email=buyer_email,
        )

    async def handle_action_sequence(
        self,
        intents: List[Intent],
    ) -> Dict[str, Any]:
        """
        Execute an ordered list of intents sequentially, threading session
        state between steps.  Returns a consolidated summary message.
        """
        results: List[Dict[str, Any]] = []
        buyers = self._get_all_buyers()

        for step_num, intent in enumerate(intents, 1):
            # Re-fetch active buyer from session (prior step may have changed it)
            active_buyer = None
            if self.session.active_buyer_id:
                active_buyer = self._get_buyer_by_id(self.session.active_buyer_id)

            # Resolve buyer reference for this step using current state
            intent = resolve_buyer_from_intent(intent, self.agent_id, active_buyer)

            try:
                response = await self._route_intent(intent, active_buyer, buyers)

                # Determine if the step succeeded
                is_error = (
                    response.get("type") == "text"
                    and any(kw in response.get("body", "").lower() for kw in ("failed", "couldn't find", "no buyer"))
                )

                buyer_display = (
                    intent.buyer_reference
                    or (active_buyer.get("name") if active_buyer else None)
                    or self.session.active_buyer_name
                    or ""
                )
                template = self._STEP_SUMMARY_TEMPLATES.get(intent.type, intent.type.value)
                summary = template.format(buyer=buyer_display)

                results.append({
                    "step": step_num,
                    "intent": intent.type.value,
                    "success": not is_error,
                    "summary": summary,
                    "response": response,
                })

                # Abort on critical failures
                if is_error and intent.type in self._ABORT_ON_ERROR_INTENTS:
                    error_body = response.get("body", "")
                    results[-1]["summary"] = f"{summary} — {error_body[:80]}"
                    break

                # Refresh session object after each step (handler may have saved changes)
                refreshed = await SessionManager.get(self.phone)
                if refreshed:
                    self.session = refreshed

            except Exception as e:
                logger.error(f"Action sequence step {step_num} failed: {e}", exc_info=True)
                results.append({
                    "step": step_num,
                    "intent": intent.type.value,
                    "success": False,
                    "summary": f"Step {step_num} failed: {str(e)[:60]}",
                })
                break

        return MessageBuilder.action_sequence_summary(results)

    async def _execute_action_sequence(self, action_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a stored action sequence after user confirmation.
        Called from ``_handle_confirm`` when ``pending_action.type == "action_sequence"``.
        """
        raw_intents = action_data.get("intents", [])
        intents: List[Intent] = []
        for raw in raw_intents:
            try:
                intent_type = IntentType(raw.get("type", "unknown"))
            except ValueError:
                intent_type = IntentType.UNKNOWN
            intents.append(Intent(
                type=intent_type,
                buyer_reference=raw.get("buyer_reference"),
                buyer_id=raw.get("buyer_id"),
                params=raw.get("params", {}),
                raw_text=raw.get("raw_text", ""),
                confidence=raw.get("confidence", 1.0),
            ))

        if not intents:
            return MessageBuilder.error("No actions to execute.")

        return await self.handle_action_sequence(intents)

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
- "field": one of ["budgetMin", "budgetMax", "bedrooms", "bathrooms", "location", "mustHaveFeatures", "dealbreakers", "homeType", "minSqft", "maxSqft", "minYearBuilt", "maxYearBuilt", "minGarageSpaces", "maxMaintenanceFee", "minLotSizeSqft", "maxDaysOnMarket"]
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
