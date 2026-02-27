"""
WhatsApp Message Builder

Formats responses for WhatsApp with proper formatting:
- Buyer cards with status indicators
- Property listings
- Reports and search results
- Interactive elements (buttons, lists)

All messages respect WhatsApp's character limits:
- Text body: 4096 chars
- Button title: 20 chars
- List row title: 24 chars
- List row description: 72 chars
"""

from typing import List, Dict, Any, Optional
from datetime import datetime


# Status indicators
STATUS_ICONS = {
    "needs_attention": "🔴",
    "ready": "🟡", 
    "monitoring": "🟢",
    "searching": "⏳",
    "completed": "✅",
}


class MessageBuilder:
    """Build formatted WhatsApp messages."""

    @staticmethod
    def _fmt_amount(val: int) -> str:
        """Format a dollar amount: 1000000→$1M, 1500000→$1.5M, 640000→$640K."""
        if not val:
            return ""
        if val >= 1_000_000:
            m = val / 1_000_000
            formatted = f"{m:.1f}".rstrip("0").rstrip(".")
            return f"${formatted}M"
        return f"${val // 1_000}K"

    @staticmethod
    def text(body: str, **kwargs) -> Dict[str, Any]:
        """Build a simple text message."""
        return {"type": "text", "body": body[:4096], **kwargs}
    
    @staticmethod
    def buttons(
        body: str,
        buttons: List[Dict[str, str]],
        header: str = None,
        footer: str = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Build an interactive button message.
        
        Args:
            body: Message body text
            buttons: List of {"id": "...", "title": "..."} (max 3)
            header: Optional header text
            footer: Optional footer text
        """
        return {
            "type": "buttons",
            "body": body[:1024],
            "buttons": buttons[:3],
            "header": header[:60] if header else None,
            "footer": footer[:60] if footer else None,
            **kwargs
        }
    
    @staticmethod
    def list(
        body: str,
        button_text: str,
        sections: List[Dict[str, Any]],
        header: str = None,
        footer: str = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Build an interactive list message.
        
        Args:
            body: Message body text
            button_text: Button text (max 20 chars)
            sections: List of {"title": "...", "rows": [...]}
            header: Optional header text
            footer: Optional footer text
        """
        return {
            "type": "list",
            "body": body[:1024],
            "button_text": button_text[:20],
            "sections": sections,
            "header": header[:60] if header else None,
            "footer": footer[:60] if footer else None,
            **kwargs
        }
    
    # =========================================================================
    # Buyer-related messages
    # =========================================================================
    
    @staticmethod
    def buyer_list(
        buyers: List[Dict[str, Any]],
        include_priority: bool = True
    ) -> Dict[str, Any]:
        """
        Build buyer list as interactive list message.
        
        Groups buyers by status if include_priority is True.
        """
        if not buyers:
            return MessageBuilder.buttons(
                "You don't have any buyers yet.\n\nCreate your first buyer to get started!",
                [
                    {"id": "new_buyer", "title": "Create Buyer"},
                    {"id": "help", "title": "Help"}
                ]
            )
        
        # Build sections by status
        sections = []
        
        if include_priority:
            # Group by status (simplified - would need real status logic)
            priority_buyers = [b for b in buyers if b.get("has_report_notes")]
            ready_buyers = [b for b in buyers if b.get("last_search_id") and not b.get("has_report_notes")]
            other_buyers = [b for b in buyers if not b.get("last_search_id") and not b.get("has_report_notes")]
            
            if priority_buyers:
                sections.append({
                    "title": "🔴 Needs Attention",
                    "rows": [MessageBuilder._buyer_row(b) for b in priority_buyers[:5]]
                })
            
            if ready_buyers:
                sections.append({
                    "title": "🟡 Ready for Action",
                    "rows": [MessageBuilder._buyer_row(b) for b in ready_buyers[:5]]
                })
            
            if other_buyers:
                sections.append({
                    "title": "📋 All Buyers",
                    "rows": [MessageBuilder._buyer_row(b) for b in other_buyers[:10]]
                })
        
        # If no sections yet, just list all buyers
        if not sections:
            sections.append({
                "title": "Your Buyers",
                "rows": [MessageBuilder._buyer_row(b) for b in buyers[:10]]
            })
        
        body = f"📋 *Your Buyers* ({len(buyers)} total)\n\nTap a buyer to focus on them."
        
        return MessageBuilder.list(
            body=body,
            button_text="Select Buyer",
            sections=sections,
            footer="Reply with code (e.g., SC1) or name"
        )
    
    @staticmethod
    def _buyer_row(buyer: Dict[str, Any]) -> Dict[str, str]:
        """Build a single buyer row for list selection."""
        code = buyer.get("whatsapp_code", "")
        name = buyer.get("name", "Unknown")[:20]
        
        # Build description
        desc_parts = []
        if buyer.get("location"):
            desc_parts.append(buyer["location"][:20])
        if buyer.get("budget_min") and buyer.get("budget_max"):
            desc_parts.append(f"{MessageBuilder._fmt_amount(buyer['budget_min'])}-{MessageBuilder._fmt_amount(buyer['budget_max'])}")
        elif buyer.get("budget"):
            desc_parts.append(str(buyer["budget"])[:15])
        
        description = " · ".join(desc_parts)[:72] if desc_parts else ""
        
        return {
            "id": f"select_buyer_{code}" if code else f"select_buyer_{buyer.get('id')}",
            "title": f"{name} ({code})" if code else name,
            "description": description
        }
    
    @staticmethod
    def buyer_card(buyer: Dict[str, Any], show_actions: bool = True) -> Dict[str, Any]:
        """
        Build detailed buyer card with profile info.
        """
        code = buyer.get("whatsapp_code", "")
        name = buyer.get("name", "Unknown")
        
        lines = [
            f"🎯 *{name}* ({code})" if code else f"🎯 *{name}*",
            ""
        ]
        
        # Contact info
        if buyer.get("email"):
            lines.append(f"📧 {buyer['email']}")
        if buyer.get("phone"):
            lines.append(f"📱 {buyer['phone']}")
        
        lines.append("")
        
        # Search criteria
        if buyer.get("location"):
            lines.append(f"📍 {buyer['location']}")
        
        if buyer.get("budget_min") and buyer.get("budget_max"):
            lines.append(f"💰 ${buyer['budget_min']:,} - ${buyer['budget_max']:,}")
        elif buyer.get("budget"):
            lines.append(f"💰 {buyer['budget']}")
        
        if buyer.get("bedrooms"):
            beds = buyer['bedrooms']
            baths = buyer.get('bathrooms', '')
            if baths:
                lines.append(f"🛏️ {beds}+ bd / {baths}+ ba")
            else:
                lines.append(f"🛏️ {beds}+ bedrooms")
        
        # Must-haves
        must_haves = buyer.get("must_have_features") or []
        if must_haves and isinstance(must_haves, list):
            lines.append("")
            lines.append("✓ " + ", ".join(must_haves[:5]))
        
        # Dealbreakers
        dealbreakers = buyer.get("dealbreakers") or []
        if dealbreakers and isinstance(dealbreakers, list):
            lines.append("✗ " + ", ".join(dealbreakers[:3]))
        
        body = "\n".join(lines)
        
        if show_actions:
            return MessageBuilder.buttons(
                body=body,
                buttons=[
                    {"id": "search", "title": "Search"},
                    {"id": "edit", "title": "Edit Profile"},
                    {"id": "done", "title": "Done"}
                ],
                footer="What would you like to do?"
            )
        else:
            return MessageBuilder.text(body)
    
    @staticmethod
    def buyer_context_entered(buyer: Dict[str, Any]) -> Dict[str, Any]:
        """Message when entering buyer context."""
        code = buyer.get("whatsapp_code", "")
        name = buyer.get("name", "Unknown")
        
        body = f"🎯 Now focused on *{name}* ({code})\n\nWhat would you like to do?"
        
        return MessageBuilder.buttons(
            body=body,
            buttons=[
                {"id": "search", "title": "Search"},
                {"id": "profile", "title": "View Profile"},
                {"id": "done", "title": "Back to List"}
            ]
        )
    
    @staticmethod
    def disambiguation(matches: List[Dict[str, Any]], query: str) -> Dict[str, Any]:
        """Ask user to choose between multiple buyer matches."""
        count = len(matches)
        body = f"I found {count} buyers matching \"{query}\".\n\nWhich one did you mean?"
        
        sections = [{
            "title": "Select Buyer",
            "rows": [MessageBuilder._buyer_row(b) for b in matches[:10]]
        }]
        
        return MessageBuilder.list(
            body=body,
            button_text="Choose Buyer",
            sections=sections
        )
    
    # =========================================================================
    # Search & Property messages
    # =========================================================================
    
    @staticmethod
    def search_started(buyer_name: str) -> Dict[str, Any]:
        """Message when search begins."""
        return MessageBuilder.text(
            f"🔍 Searching for *{buyer_name}*...\n\n"
            "⏳ Finding properties...\n"
            "⏳ Analyzing top matches...\n\n"
            "This takes about 30 seconds. I'll message you when ready."
        )
    
    @staticmethod
    def search_results(
        buyer: Dict[str, Any],
        listings: List[Dict[str, Any]],
        total_found: int
    ) -> Dict[str, Any]:
        """Format search results."""
        name = buyer.get("name", "Buyer")
        
        if not listings:
            return MessageBuilder.buttons(
                f"🔍 Search complete for *{name}*\n\n"
                "No properties matched the criteria.\n\n"
                "Try adjusting the search parameters.",
                [
                    {"id": "edit", "title": "Adjust Criteria"},
                    {"id": "done", "title": "Back"}
                ]
            )
        
        lines = [
            f"🔍 Search complete for *{name}*",
            f"Found {total_found} properties → Top {len(listings)} selected",
            ""
        ]
        
        # Show top 5 listings
        medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"]
        for i, listing in enumerate(listings[:5]):
            medal = medals[i] if i < len(medals) else f"{i+1}."
            
            address = listing.get("address", "Unknown")[:30]
            city = listing.get("city", "")
            price = listing.get("listPrice") or listing.get("price", 0)
            beds = listing.get("bedrooms", "?")
            baths = listing.get("bathrooms", "?")
            match_score = listing.get("fitScore") or listing.get("match_score", 0)
            
            lines.append(f"{medal} *{address}*")
            if city:
                lines.append(f"   {city}")
            lines.append(f"   ${price:,} · {beds}bd/{baths}ba")
            if match_score:
                lines.append(f"   ⭐ {match_score}% match")
            
            # Show one highlight if available
            analysis = listing.get("aiAnalysis") or {}
            whats_matching = analysis.get("whats_matching", [])
            if whats_matching:
                item = whats_matching[0]
                text = item if isinstance(item, str) else item.get("text") or item.get("reason") or str(item)
                lines.append(f"   ✓ {text[:40]}")
            
            lines.append("")
        
        body = "\n".join(lines)[:4000]  # Leave room for buttons
        
        return MessageBuilder.buttons(
            body=body,
            buttons=[
                {"id": "generate_report", "title": "Generate Report"},
                {"id": "edit", "title": "Adjust Search"},
                {"id": "done", "title": "Done"}
            ]
        )
    
    @staticmethod
    def property_card(listing: Dict[str, Any]) -> str:
        """Format a single property as text."""
        address = listing.get("address", "Unknown")
        city = listing.get("city", "")
        price = listing.get("listPrice") or listing.get("price", 0)
        beds = listing.get("bedrooms", "?")
        baths = listing.get("bathrooms", "?")
        sqft = listing.get("sqft") or listing.get("square_feet", 0)
        match_score = listing.get("fitScore") or listing.get("match_score", 0)
        
        lines = [f"🏠 *{address}*"]
        if city:
            lines.append(f"   {city}")
        
        details = f"${price:,} · {beds}bd/{baths}ba"
        if sqft:
            details += f" · {sqft:,} sqft"
        lines.append(f"   {details}")
        
        if match_score:
            lines.append(f"   ⭐ {match_score}% match")
        
        # AI Analysis
        analysis = listing.get("aiAnalysis") or {}
        
        def _ai_text(item) -> str:
            return item if isinstance(item, str) else item.get("text") or item.get("reason") or str(item)

        whats_matching = analysis.get("whats_matching", [])
        for item in whats_matching[:2]:
            lines.append(f"   ✓ {_ai_text(item)[:50]}")
        
        red_flags = analysis.get("red_flags", [])
        for item in red_flags[:1]:
            lines.append(f"   ⚠️ {_ai_text(item)[:50]}")
        
        return "\n".join(lines)
    
    # =========================================================================
    # Report messages
    # =========================================================================
    
    @staticmethod
    def report_ready(
        buyer: Dict[str, Any],
        share_url: str,
        listing_count: int
    ) -> Dict[str, Any]:
        """Message when report is generated."""
        name = buyer.get("name", "Buyer")
        email = buyer.get("email", "")
        
        body = (
            f"📄 Report ready for *{name}*\n\n"
            f"🔗 {share_url}\n\n"
            f"Includes {listing_count} properties with AI analysis."
        )
        
        buttons = [{"id": "done", "title": "Done"}]
        
        if email:
            buttons.insert(0, {"id": "send_report", "title": "Send to Buyer"})
        
        return MessageBuilder.buttons(body=body, buttons=buttons)
    
    @staticmethod
    def report_sent(buyer: Dict[str, Any]) -> Dict[str, Any]:
        """Confirmation when report is sent."""
        name = buyer.get("name", "Buyer")
        email = buyer.get("email", "")
        
        return MessageBuilder.buttons(
            f"📧 Report sent to *{name}*\n\n"
            f"Delivered to: {email}\n\n"
            "You'll be notified when they view it or leave notes.",
            [
                {"id": "view_buyers", "title": "View Buyers"},
                {"id": "done", "title": "Done"}
            ]
        )
    
    # =========================================================================
    # Create/Edit buyer messages
    # =========================================================================
    
    @staticmethod
    def create_buyer_prompt() -> Dict[str, Any]:
        """Prompt for new buyer creation."""
        return MessageBuilder.text(
            "📝 *New Buyer*\n\n"
            "Tell me about your buyer. Include whatever you know:\n\n"
            "• Name & contact info\n"
            "• Location preferences\n"
            "• Budget range\n"
            "• Bedrooms/bathrooms\n"
            "• Must-haves or dealbreakers\n\n"
            "Or just paste their inquiry email/text.\n\n"
            "_Reply with buyer details or type 'cancel'_"
        )
    
    @staticmethod
    def buyer_extracted(
        extracted: Dict[str, Any],
        code: str = None
    ) -> Dict[str, Any]:
        """Show extracted buyer profile for confirmation."""
        lines = ["✅ Got it! Here's what I extracted:", ""]
        
        name = extracted.get("name", "Unknown")
        lines.append(f"*{name}*" + (f" ({code})" if code else ""))
        
        if extracted.get("email"):
            lines.append(f"📧 {extracted['email']}")
        if extracted.get("phone"):
            lines.append(f"📱 {extracted['phone']}")
        
        lines.append("")
        
        if extracted.get("location"):
            lines.append(f"📍 {extracted['location']}")
        
        if extracted.get("budgetMin") and extracted.get("budgetMax"):
            lines.append(f"💰 ${extracted['budgetMin']:,} - ${extracted['budgetMax']:,}")
        elif extracted.get("budget"):
            lines.append(f"💰 {extracted['budget']}")
        
        if extracted.get("bedrooms"):
            lines.append(f"🛏️ {extracted['bedrooms']}+ bedrooms")
        
        must_haves = extracted.get("mustHaveFeatures", [])
        if must_haves:
            lines.append("✓ " + ", ".join(must_haves[:5]))
        
        dealbreakers = extracted.get("dealbreakers", [])
        if dealbreakers:
            lines.append("✗ " + ", ".join(dealbreakers[:3]))
        
        body = "\n".join(lines)
        
        return MessageBuilder.buttons(
            body=body,
            buttons=[
                {"id": "confirm", "title": "Save & Search"},
                {"id": "edit_first", "title": "Edit First"},
                {"id": "cancel", "title": "Cancel"}
            ]
        )
    
    @staticmethod
    def edit_confirmation(
        buyer: Dict[str, Any],
        changes: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Show proposed changes for confirmation."""
        name = buyer.get("name", "Buyer")
        code = buyer.get("whatsapp_code", "")
        
        lines = [f"📝 Updating *{name}* ({code})", "", "Changes:"]
        
        for change in changes[:5]:
            field = change.get("field", "")
            old_val = change.get("oldValue", "")
            new_val = change.get("newValue", "")
            action = change.get("action", "update")
            
            if action == "add":
                lines.append(f"• Add {new_val} to {field}")
            elif action == "remove":
                lines.append(f"• Remove {old_val} from {field}")
            else:
                lines.append(f"• {field}: {old_val} → {new_val}")
        
        body = "\n".join(lines)
        
        return MessageBuilder.buttons(
            body=body,
            buttons=[
                {"id": "confirm", "title": "Confirm"},
                {"id": "cancel", "title": "Cancel"}
            ]
        )
    
    # =========================================================================
    # System messages
    # =========================================================================
    
    @staticmethod
    def welcome(agent_name: str = None) -> Dict[str, Any]:
        """Welcome message for new session."""
        greeting = f"👋 Welcome back, *{agent_name}*!" if agent_name else "👋 Welcome to ResidentHive!"
        
        return MessageBuilder.buttons(
            f"{greeting}\n\n"
            "I'm your assistant for managing buyers.\n\n"
            "📋 View & manage your buyer list\n"
            "🔍 Search properties for any buyer\n"
            "📄 Generate & send buyer reports\n"
            "✏️ Update buyer preferences",
            [
                {"id": "view_buyers", "title": "View Buyers"},
                {"id": "new_buyer", "title": "New Buyer"},
                {"id": "help", "title": "Help"}
            ]
        )
    
    @staticmethod  
    def daily_briefing(
        agent_name: str,
        needs_attention: List[Dict[str, Any]],
        ready_to_send: List[Dict[str, Any]],
        monitoring: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Morning briefing summary."""
        now = datetime.now()
        time_greeting = "Good morning" if now.hour < 12 else "Good afternoon" if now.hour < 17 else "Good evening"
        
        lines = [
            f"☀️ *{time_greeting}, {agent_name}!*",
            "",
            "📊 *TODAY'S SUMMARY*",
            "━" * 18,
        ]
        
        if needs_attention:
            lines.append(f"🔴 {len(needs_attention)} need your attention")
        if ready_to_send:
            lines.append(f"🟡 {len(ready_to_send)} reports ready to send")
        if monitoring:
            lines.append(f"🟢 {len(monitoring)} price drops overnight")
        
        if not needs_attention and not ready_to_send and not monitoring:
            lines.append("All caught up! 🎉")
        
        buttons = []
        if needs_attention:
            top = needs_attention[0]
            buttons.append({"id": f"select_buyer_{top.get('whatsapp_code', top.get('id'))}", "title": f"Start: {top.get('name', 'Buyer')[:12]}"})
        
        buttons.append({"id": "view_buyers", "title": "View All"})
        
        if len(buttons) < 3:
            buttons.append({"id": "new_buyer", "title": "New Buyer"})
        
        return MessageBuilder.buttons("\n".join(lines), buttons)
    
    @staticmethod
    def help_message(in_buyer_context: bool = False) -> Dict[str, Any]:
        """Help message with available commands."""
        if in_buyer_context:
            body = (
                "📖 *Available Commands*\n\n"
                "*In Buyer Context:*\n"
                "• search - Find properties\n"
                "• report - Generate report\n"
                "• send - Send report to buyer\n"
                "• profile - View details\n"
                "• edit - Update preferences\n"
                "• done - Back to buyer list\n"
                "• reset - Start fresh session\n\n"
                "*Quick Tips:*\n"
                "• Say 'increase budget by $50K'\n"
                "• Say 'add pool to must-haves'\n"
                "• Type buyer code (SC1) to switch"
            )
        else:
            body = (
                "📖 *Available Commands*\n\n"
                "*Navigation:*\n"
                "• all / list - View all buyers\n"
                "• new - Create new buyer\n"
                "• [code] - Select buyer (e.g., SC1)\n"
                "• help - Show this message\n"
                "• reset - Start fresh session\n\n"
                "*Shortcuts:*\n"
                "• SC1 s - Search for SC1\n"
                "• MJ1 r - Report for MJ1\n"
                "• AR1 r send - Report & send"
            )
        
        return MessageBuilder.buttons(
            body,
            [
                {"id": "view_buyers", "title": "View Buyers"},
                {"id": "new_buyer", "title": "New Buyer"}
            ]
        )
    
    @staticmethod
    def error(message: str = None) -> Dict[str, Any]:
        """Error message."""
        return MessageBuilder.buttons(
            message or "Sorry, something went wrong. Please try again.",
            [
                {"id": "help", "title": "Help"},
                {"id": "view_buyers", "title": "View Buyers"}
            ]
        )
    
    @staticmethod
    def context_exited() -> Dict[str, Any]:
        """Message when exiting buyer context."""
        return MessageBuilder.buttons(
            "✅ Done!\n\nWhat would you like to do next?",
            [
                {"id": "view_buyers", "title": "View Buyers"},
                {"id": "new_buyer", "title": "New Buyer"},
                {"id": "help", "title": "Help"}
            ]
        )
