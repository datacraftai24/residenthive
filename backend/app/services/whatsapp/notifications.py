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
