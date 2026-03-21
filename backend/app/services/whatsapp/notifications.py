"""
Proactive WhatsApp Notifications

Sends notifications to agents for important events:
- Buyer viewed their report
- Buyer left notes on report
- Price drops on saved properties
- Daily briefing

These can be triggered by:
- Database triggers/webhooks
- Scheduled tasks (cron)
- Direct API calls
"""

import os
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

from .client import WhatsAppClient
from .messages import MessageBuilder
from ...db import get_conn, fetchall_dicts, fetchone_dict

logger = logging.getLogger(__name__)


class WhatsAppNotifications:
    """
    Handle proactive notifications to agents via WhatsApp.
    """
    
    def __init__(self):
        self.client = WhatsAppClient()
    
    async def notify_report_viewed(
        self,
        agent_id: int,
        buyer_name: str,
        share_id: str
    ) -> bool:
        """
        Notify agent when buyer views their report.
        
        Args:
            agent_id: Agent's database ID
            buyer_name: Buyer's name
            share_id: Report share ID
            
        Returns:
            True if notification sent
        """
        phone = self._get_agent_whatsapp(agent_id)
        if not phone:
            logger.debug(f"Agent {agent_id} has no WhatsApp connected")
            return False
        
        try:
            frontend_url = os.getenv("FRONTEND_BASE_URL", "https://app.residenthive.com")
            report_url = f"{frontend_url}/buyer-report/{share_id}"
            
            await self.client.send_text(
                phone,
                f"👀 *{buyer_name}* just viewed their report!\n\n"
                f"🔗 {report_url}\n\n"
                "_Reply with their code to see more details_"
            )
            
            logger.info(f"Sent report viewed notification to agent {agent_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send report viewed notification: {e}")
            return False
    
    async def notify_buyer_notes(
        self,
        agent_id: int,
        buyer_name: str,
        buyer_code: str,
        notes_preview: str,
        share_id: str
    ) -> bool:
        """
        Notify agent when buyer leaves notes on report.
        
        Args:
            agent_id: Agent's database ID
            buyer_name: Buyer's name
            buyer_code: Buyer's WhatsApp code
            notes_preview: First 100 chars of notes
            share_id: Report share ID
            
        Returns:
            True if notification sent
        """
        phone = self._get_agent_whatsapp(agent_id)
        if not phone:
            return False
        
        try:
            await self.client.send_interactive_buttons(
                phone,
                f"📝 *{buyer_name}* left notes!\n\n"
                f"\"{notes_preview[:100]}{'...' if len(notes_preview) > 100 else ''}\"\n\n"
                "_Tap to respond or view full notes_",
                [
                    {"id": f"select_buyer_{buyer_code}", "title": f"View {buyer_name[:15]}"},
                    {"id": "view_buyers", "title": "All Buyers"}
                ]
            )
            
            logger.info(f"Sent buyer notes notification to agent {agent_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send buyer notes notification: {e}")
            return False
    
    async def notify_price_drop(
        self,
        agent_id: int,
        buyer_name: str,
        buyer_code: str,
        property_address: str,
        old_price: int,
        new_price: int
    ) -> bool:
        """
        Notify agent of price drop on buyer's saved property.
        
        Args:
            agent_id: Agent's database ID
            buyer_name: Buyer's name
            buyer_code: Buyer's WhatsApp code
            property_address: Property address
            old_price: Previous price
            new_price: New price
            
        Returns:
            True if notification sent
        """
        phone = self._get_agent_whatsapp(agent_id)
        if not phone:
            return False
        
        try:
            drop_amount = old_price - new_price
            drop_pct = (drop_amount / old_price) * 100
            
            await self.client.send_interactive_buttons(
                phone,
                f"📉 Price drop alert for *{buyer_name}*!\n\n"
                f"🏠 {property_address}\n"
                f"💰 ${old_price:,} → ${new_price:,}\n"
                f"📉 -{drop_pct:.1f}% (${drop_amount:,} off)\n\n"
                "_This property is on their saved list_",
                [
                    {"id": f"select_buyer_{buyer_code}", "title": f"View {buyer_name[:15]}"},
                    {"id": "view_buyers", "title": "All Buyers"}
                ]
            )
            
            logger.info(f"Sent price drop notification to agent {agent_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send price drop notification: {e}")
            return False
    
    async def notify_report_generated(
        self,
        agent_id: int,
        buyer_name: str,
        share_id: str,
        listing_count: int
    ) -> bool:
        """
        Notify agent when a report is generated (from web UI),
        sending approval buttons so they can approve/reject before emailing the buyer.
        """
        phone = self._get_agent_whatsapp(agent_id)
        if not phone:
            logger.debug(f"Agent {agent_id} has no WhatsApp connected")
            return False

        try:
            frontend_url = os.getenv("FRONTEND_BASE_URL", "https://app.residenthive.com")
            share_url = f"{frontend_url}/buyer-report/{share_id}"

            msg = MessageBuilder.report_approval_request(
                buyer_name=buyer_name,
                share_url=share_url,
                listing_count=listing_count,
            )

            # Store pending action in the agent's session so the buttons work
            from .session import SessionManager
            session = await SessionManager.get_by_agent(agent_id)
            if session:
                await SessionManager.set_pending_action(
                    session.phone,
                    "approve_report",
                    {
                        "share_id": share_id,
                        "share_url": share_url,
                        "buyer_name": buyer_name,
                        "buyer_email": self._get_buyer_email_for_report(share_id),
                        "listing_count": listing_count,
                    }
                )

            await self.client.send_interactive_buttons(
                phone,
                msg["body"],
                msg["buttons"]
            )

            logger.info(f"Sent report approval notification to agent {agent_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to send report generated notification: {e}")
            return False

    async def notify_showing_request(
        self,
        agent_id: int,
        buyer_name: str,
        listing_address: str,
        share_id: str,
    ) -> bool:
        """
        Notify agent when a buyer requests a showing from their report.
        """
        phone = self._get_agent_whatsapp(agent_id)
        if not phone:
            logger.debug(f"Agent {agent_id} has no WhatsApp connected")
            return False

        try:
            frontend_url = os.getenv("FRONTEND_BASE_URL", "https://app.residenthive.com")
            report_url = f"{frontend_url}/buyer-report/{share_id}"

            await self.client.send_interactive_buttons(
                phone,
                f"🏠 *Showing Request!*\n\n"
                f"*{buyer_name}* wants to see:\n"
                f"📍 {listing_address}\n\n"
                f"🔗 {report_url}\n\n"
                "_Tap to acknowledge or view their report._",
                [
                    {"id": "confirm", "title": "Acknowledge"},
                    {"id": "view_buyers", "title": "View Buyers"}
                ]
            )

            logger.info(f"Sent showing request notification to agent {agent_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to send showing request notification: {e}")
            return False

    # =========================================================================
    # Lead Notifications
    # =========================================================================

    async def notify_new_lead(
        self,
        agent_id: int,
        lead_data: Dict[str, Any],
    ) -> bool:
        """
        Notify agent when a new lead is processed (from web UI or WhatsApp).

        Args:
            agent_id: Agent's database ID
            lead_data: Dict with lead info (name, email, location, budget, etc.)

        Returns:
            True if notification sent
        """
        phone = self._get_agent_whatsapp(agent_id)
        if not phone:
            return False

        try:
            msg = MessageBuilder.lead_processed(lead_data)

            # Store pending action so buttons work
            from .session import SessionManager
            session = await SessionManager.get_by_agent(agent_id)
            if session:
                await SessionManager.set_pending_action(
                    session.phone,
                    "send_outreach",
                    {
                        "lead_id": lead_data.get("lead_id"),
                        "lead_name": lead_data.get("name") or "Lead",
                        "lead_email": lead_data.get("email"),
                    }
                )

            await self.client.send_interactive_buttons(
                phone,
                msg["body"],
                msg["buttons"],
            )

            logger.info(f"Sent new lead notification to agent {agent_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to send new lead notification: {e}")
            return False

    async def notify_lead_outreach_ready(
        self,
        agent_id: int,
        lead_name: str,
        lead_email: str,
        lead_id: int,
        share_id: str,
    ) -> bool:
        """
        Notify agent that an outreach report is ready for review.
        Human-in-the-loop: agent must approve before email is sent.
        """
        phone = self._get_agent_whatsapp(agent_id)
        if not phone:
            return False

        try:
            frontend_url = os.getenv("FRONTEND_BASE_URL", "https://residencehive.com")
            report_url = f"{frontend_url}/buyer-report/{share_id}"

            msg = (
                f"📄 *Outreach report ready for {lead_name}*\n\n"
                f"🔗 {report_url}\n\n"
                "Review the report, then approve to email it to the lead."
            )

            await self.client.send_interactive_buttons(
                to=phone,
                body=msg,
                buttons=[
                    {"id": "btn_approve_outreach", "title": "Approve & Send"},
                    {"id": "btn_reject_outreach", "title": "Reject"},
                ],
                header="Outreach Approval",
            )

            # Store pending action so button tap triggers approval
            from .session import SessionManager
            await SessionManager.set_pending_action(
                phone,
                "approve_outreach",
                {
                    "share_id": share_id,
                    "share_url": report_url,
                    "lead_id": lead_id,
                    "lead_name": lead_name,
                    "lead_email": lead_email,
                }
            )

            logger.info(f"Sent outreach approval request to agent {agent_id} for lead {lead_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to send outreach approval request: {e}")
            return False

    async def notify_lead_email_sent(
        self,
        agent_id: int,
        lead_name: str,
        subject: str,
    ) -> bool:
        """Notify agent that an email was sent to a lead."""
        phone = self._get_agent_whatsapp(agent_id)
        if not phone:
            return False

        try:
            await self.client.send_text(
                phone,
                f"📨 Email sent to *{lead_name}*\n\n"
                f"Subject: _{subject}_"
            )
            logger.info(f"Sent lead email notification to agent {agent_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to send lead email notification: {e}")
            return False

    async def notify_lead_activity(
        self,
        agent_id: int,
        activity_type: str,
        lead_name: str,
        share_id: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Push lead engagement signals to agent's WhatsApp.

        Args:
            agent_id: Agent's database ID
            activity_type: "viewed_report" | "chatbot_engaged" | "cta_clicked" | "left_notes"
            lead_name: Lead's name
            share_id: Report share ID
            details: Optional extra details

        Returns:
            True if notification sent
        """
        phone = self._get_agent_whatsapp(agent_id)
        if not phone:
            return False

        try:
            frontend_url = os.getenv("FRONTEND_BASE_URL", "https://app.residenthive.com")
            report_url = f"{frontend_url}/buyer-report/{share_id}"

            messages = {
                "viewed_report": f"👀 *{lead_name}* just opened their report!\n\n🔗 {report_url}",
                "chatbot_engaged": (
                    f"💬 *{lead_name}* is chatting with the AI assistant"
                    + (f" ({details.get('message_count', '?')} messages)" if details else "")
                    + f"\n\n🔗 {report_url}"
                ),
                "cta_clicked": (
                    f"🔥 *{lead_name}* clicked "
                    + (details.get("cta_name", "a CTA") if details else "a CTA")
                    + "! High intent — consider calling now."
                    + f"\n\n🔗 {report_url}"
                ),
                "left_notes": f"📝 *{lead_name}* left feedback on a property\n\n🔗 {report_url}",
            }

            msg = messages.get(activity_type)
            if not msg:
                logger.warning(f"Unknown lead activity type: {activity_type}")
                return False

            await self.client.send_text(phone, msg)
            logger.info(f"Sent lead activity ({activity_type}) notification to agent {agent_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to send lead activity notification: {e}")
            return False

    def _get_buyer_email_for_report(self, share_id: str) -> Optional[str]:
        """Look up the buyer email from a report's share_id."""
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT bp.email
                        FROM buyer_reports br
                        JOIN buyer_profiles bp ON br.profile_id = bp.id
                        WHERE br.share_id = %s
                        """,
                        (share_id,)
                    )
                    row = fetchone_dict(cur)
                    return row.get("email") if row else None
        except Exception:
            return None

    async def send_daily_briefing(self, agent_id: int) -> bool:
        """
        Send daily briefing to agent.
        
        Args:
            agent_id: Agent's database ID
            
        Returns:
            True if notification sent
        """
        phone = self._get_agent_whatsapp(agent_id)
        if not phone:
            return False
        
        try:
            # Get agent info
            agent_name = self._get_agent_name(agent_id)
            
            # Get buyers needing attention
            needs_attention = self._get_buyers_needing_attention(agent_id)
            ready_to_send = self._get_buyers_ready_to_send(agent_id)
            monitoring = self._get_price_drops(agent_id)
            
            response = MessageBuilder.daily_briefing(
                agent_name=agent_name or "there",
                needs_attention=needs_attention,
                ready_to_send=ready_to_send,
                monitoring=monitoring
            )
            
            if response.get("type") == "buttons":
                await self.client.send_interactive_buttons(
                    phone,
                    response["body"],
                    response["buttons"]
                )
            else:
                await self.client.send_text(phone, response["body"])
            
            logger.info(f"Sent daily briefing to agent {agent_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send daily briefing: {e}")
            return False
    
    # =========================================================================
    # Helper Methods
    # =========================================================================
    
    def _get_agent_whatsapp(self, agent_id: int) -> Optional[str]:
        """Get agent's WhatsApp phone number."""
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT whatsapp_phone FROM agents WHERE id = %s",
                    (agent_id,)
                )
                row = fetchone_dict(cur)
                return row.get("whatsapp_phone") if row else None
    
    def _get_agent_name(self, agent_id: int) -> Optional[str]:
        """Get agent's name."""
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT first_name, last_name FROM agents WHERE id = %s",
                    (agent_id,)
                )
                row = fetchone_dict(cur)
                if row:
                    return f"{row.get('first_name', '')} {row.get('last_name', '')}".strip()
                return None
    
    def _get_buyers_needing_attention(self, agent_id: int) -> List[Dict[str, Any]]:
        """Get buyers who need agent attention (recent notes, etc.)."""
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT bp.id, bp.name, bp.whatsapp_code, br.buyer_notes_updated_at
                    FROM buyer_profiles bp
                    JOIN buyer_reports br ON br.profile_id = bp.id
                    WHERE bp.agent_id = %s 
                    AND br.buyer_notes IS NOT NULL
                    AND br.buyer_notes_updated_at > NOW() - INTERVAL '24 hours'
                    ORDER BY br.buyer_notes_updated_at DESC
                    LIMIT 5
                    """,
                    (agent_id,)
                )
                return fetchall_dicts(cur)
    
    def _get_buyers_ready_to_send(self, agent_id: int) -> List[Dict[str, Any]]:
        """Get buyers with reports ready to send."""
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT bp.id, bp.name, bp.whatsapp_code
                    FROM buyer_profiles bp
                    WHERE bp.agent_id = %s
                    AND bp.last_search_id IS NOT NULL
                    AND NOT EXISTS (
                        SELECT 1 FROM buyer_reports br 
                        WHERE br.profile_id = bp.id 
                        AND br.created_at > bp.last_search_at
                    )
                    LIMIT 5
                    """,
                    (agent_id,)
                )
                return fetchall_dicts(cur)
    
    def _get_price_drops(self, agent_id: int) -> List[Dict[str, Any]]:
        """Get recent price drops on saved properties."""
        # Placeholder - would need price history tracking
        return []


# ============================================================================
# Webhook trigger functions (called when events occur)
# ============================================================================

async def on_report_viewed(share_id: str):
    """
    Trigger notification when buyer views report.
    Called from buyer_reports endpoint when report is accessed.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT br.agent_id, bp.name as buyer_name, bp.whatsapp_code
                FROM buyer_reports br
                JOIN buyer_profiles bp ON br.profile_id = bp.id
                WHERE br.share_id = %s
                """,
                (share_id,)
            )
            row = fetchone_dict(cur)
    
    if row and row.get("agent_id"):
        notifier = WhatsAppNotifications()
        await notifier.notify_report_viewed(
            agent_id=row["agent_id"],
            buyer_name=row.get("buyer_name", "Buyer"),
            share_id=share_id
        )


async def on_buyer_notes_updated(share_id: str, notes: str):
    """
    Trigger notification when buyer leaves notes.
    Called from buyer_reports endpoint when notes are updated.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT br.agent_id, bp.name as buyer_name, bp.whatsapp_code
                FROM buyer_reports br
                JOIN buyer_profiles bp ON br.profile_id = bp.id
                WHERE br.share_id = %s
                """,
                (share_id,)
            )
            row = fetchone_dict(cur)
    
    if row and row.get("agent_id"):
        notifier = WhatsAppNotifications()
        await notifier.notify_buyer_notes(
            agent_id=row["agent_id"],
            buyer_name=row.get("buyer_name", "Buyer"),
            buyer_code=row.get("whatsapp_code", ""),
            notes_preview=notes,
            share_id=share_id
        )


async def on_lead_processed(agent_id: int, lead_data: Dict[str, Any]):
    """
    Trigger notification when a lead is processed (from web UI).
    Called from leads.py process_lead_endpoint().
    """
    notifier = WhatsAppNotifications()
    await notifier.notify_new_lead(agent_id=agent_id, lead_data=lead_data)


async def on_lead_outreach_ready(
    agent_id: int, lead_name: str, lead_email: str, lead_id: int, share_id: str,
):
    """
    Trigger approval request when outreach report is generated.
    Called from leads.py generate_lead_outreach().
    Human-in-the-loop: agent must approve before email goes out.
    """
    notifier = WhatsAppNotifications()
    await notifier.notify_lead_outreach_ready(
        agent_id=agent_id,
        lead_name=lead_name,
        lead_email=lead_email,
        lead_id=lead_id,
        share_id=share_id,
    )


async def on_lead_email_sent(agent_id: int, lead_name: str, subject: str):
    """
    Trigger notification when email is sent to a lead.
    Called from leads.py send_lead_email().
    """
    notifier = WhatsAppNotifications()
    await notifier.notify_lead_email_sent(
        agent_id=agent_id,
        lead_name=lead_name,
        subject=subject,
    )


async def on_lead_activity(share_id: str, activity_type: str, details: Optional[Dict[str, Any]] = None):
    """
    Trigger notification for lead engagement signals.
    Called from buyer_reports.py when lead views report, leaves notes, etc.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT br.agent_id, bp.name as buyer_name
                FROM buyer_reports br
                JOIN buyer_profiles bp ON br.profile_id = bp.id
                WHERE br.share_id = %s
                """,
                (share_id,)
            )
            row = fetchone_dict(cur)

    if row and row.get("agent_id"):
        notifier = WhatsAppNotifications()
        await notifier.notify_lead_activity(
            agent_id=row["agent_id"],
            activity_type=activity_type,
            lead_name=row.get("buyer_name", "Lead"),
            share_id=share_id,
            details=details,
        )


async def send_all_daily_briefings():
    """
    Send daily briefings to all agents with WhatsApp connected.
    Should be called by a scheduled task (e.g., cron job at 8am).
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM agents 
                WHERE whatsapp_phone IS NOT NULL
                """
            )
            agents = fetchall_dicts(cur)
    
    notifier = WhatsAppNotifications()
    sent_count = 0
    
    for agent in agents:
        try:
            success = await notifier.send_daily_briefing(agent["id"])
            if success:
                sent_count += 1
        except Exception as e:
            logger.error(f"Failed to send briefing to agent {agent['id']}: {e}")
    
    logger.info(f"Sent daily briefings to {sent_count}/{len(agents)} agents")
    return sent_count
