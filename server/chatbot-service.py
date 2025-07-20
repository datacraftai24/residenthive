"""
Real Estate Chatbot Service for ResidentHive
Integrates the RealEstateIntelligence chatbot with customer-specific data
"""

import os
import sys
import json
import asyncio
from typing import Dict, List, Optional, Any
from pathlib import Path

# Add the RealEstateIntelligence directory to the path
current_dir = Path(__file__).parent
re_intelligence_dir = current_dir.parent.parent / "RealEstateIntelligence"
sys.path.append(str(re_intelligence_dir))

try:
    from agent import RealEstateChatbot, get_chatbot
    from vector_store import PropertyVectorStore, get_vector_store, vector_store_available
except ImportError as e:
    print(f"Error importing RealEstateIntelligence modules: {e}")
    print(f"Make sure RealEstateIntelligence is available at: {re_intelligence_dir}")
    sys.exit(1)

class ResidentHiveChatbotService:
    def __init__(self):
        """Initialize the chatbot service for ResidentHive"""
        self.chatbot = get_chatbot("ResidentHive Agent")
        self.vector_store = None
        
        # Initialize vector store if available
        if vector_store_available():
            self.vector_store = get_vector_store()
            print(f"✅ Vector store initialized with {self.vector_store.get_property_count()} properties")
        else:
            print("⚠️  No vector store found. Chatbot will use general knowledge only.")
    
    def add_customer_properties(self, customer_id: str, properties: List[Dict]) -> bool:
        """Add customer-specific properties to the vector store"""
        if not self.vector_store:
            print("❌ No vector store available for adding properties")
            return False
        
        try:
            # Create customer-specific collection name
            collection_name = f"customer_{customer_id}_properties"
            
            # Add properties to vector store
            self.vector_store.add_properties(properties)
            print(f"✅ Added {len(properties)} properties for customer {customer_id}")
            return True
        except Exception as e:
            print(f"❌ Error adding properties for customer {customer_id}: {e}")
            return False
    
    async def chat_with_customer(self, message: str, customer_id: str, customer_properties: List[Dict] = None) -> Dict[str, Any]:
        """Process a chat message for a specific customer"""
        try:
            # If customer properties are provided, add them to context
            if customer_properties:
                self.add_customer_properties(customer_id, customer_properties)
            
            # Process the message using the chatbot
            response = await self.chatbot.chat(message, customer_id, customer_properties)
            
            return {
                "success": True,
                "response": response,
                "customer_id": customer_id,
                "agent_name": self.chatbot.agent_name
            }
            
        except Exception as e:
            print(f"❌ Error in chat_with_customer: {e}")
            return {
                "success": False,
                "error": str(e),
                "response": "I'm sorry, I'm having trouble processing your request right now. Please try again.",
                "customer_id": customer_id
            }
    
    def get_customer_memory_summary(self, customer_id: str) -> Optional[str]:
        """Get a summary of the customer's conversation history"""
        try:
            memory = self.chatbot.get_user_memory(customer_id)
            if memory.chat_memory.messages:
                # Get the memory summary
                return memory.moving_summary_buffer
            return None
        except Exception as e:
            print(f"❌ Error getting memory summary for customer {customer_id}: {e}")
            return None
    
    def clear_customer_memory(self, customer_id: str) -> bool:
        """Clear the conversation memory for a specific customer"""
        try:
            if customer_id in self.chatbot.user_memories:
                del self.chatbot.user_memories[customer_id]
                print(f"✅ Cleared memory for customer {customer_id}")
                return True
            return False
        except Exception as e:
            print(f"❌ Error clearing memory for customer {customer_id}: {e}")
            return False

# Global service instance
_chatbot_service = None

def get_chatbot_service() -> ResidentHiveChatbotService:
    """Get or create the global chatbot service instance"""
    global _chatbot_service
    if _chatbot_service is None:
        _chatbot_service = ResidentHiveChatbotService()
    return _chatbot_service

# For Node.js integration
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python chatbot-service.py <method> <data>"}))
        sys.exit(1)
    
    method = sys.argv[1]
    data = json.loads(sys.argv[2])
    
    async def handle_request():
        service = get_chatbot_service()
        
        try:
            if method == "chat":
                result = await service.chat_with_customer(
                    data["message"],
                    data["customerId"],
                    data.get("customerProperties")
                )
                print(json.dumps(result))
                
            elif method == "memory_summary":
                summary = service.get_customer_memory_summary(data["customerId"])
                print(json.dumps({"summary": summary}))
                
            elif method == "clear_memory":
                success = service.clear_customer_memory(data["customerId"])
                print(json.dumps({"success": success}))
                
            elif method == "add_properties":
                success = service.add_customer_properties(
                    data["customerId"],
                    data["properties"]
                )
                print(json.dumps({"success": success}))
                
            else:
                print(json.dumps({"error": f"Unknown method: {method}"}))
                
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    
    asyncio.run(handle_request()) 