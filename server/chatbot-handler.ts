import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ChatRequest {
  message: string;
  customerId: string;
  customerProperties?: Array<{
    address: string;
    price: string;
    bedrooms: number;
    bathrooms: number;
    property_type: string;
    city: string;
    state: string;
    description?: string;
  }>;
}

export interface ChatResponse {
  success: boolean;
  response: string;
  customerId: string;
  agentName?: string;
  error?: string;
}

export interface MemorySummary {
  customerId: string;
  summary?: string;
}

class ChatbotHandler {
  private pythonPath: string;
  private scriptPath: string;

  constructor() {
    // Use python3 or python depending on the system
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
    this.scriptPath = path.join(__dirname, 'chatbot-service.py');
  }

  private async executePythonScript(method: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(this.pythonPath, [this.scriptPath, method, JSON.stringify(data)]);
      
      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim());
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse Python output: ${stdout}`));
          }
        } else {
          reject(new Error(`Python script failed with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  }

  async chatWithCustomer(request: ChatRequest): Promise<ChatResponse> {
    try {
      const result = await this.executePythonScript('chat', request);
      return result;
    } catch (error) {
      console.error('Error in chatWithCustomer:', error);
      return {
        success: false,
        response: "I'm sorry, I'm having trouble processing your request right now. Please try again.",
        customerId: request.customerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getCustomerMemorySummary(customerId: string): Promise<MemorySummary> {
    try {
      const result = await this.executePythonScript('memory_summary', { customerId });
      return {
        customerId,
        summary: result.summary
      };
    } catch (error) {
      console.error('Error getting memory summary:', error);
      return {
        customerId,
        summary: undefined
      };
    }
  }

  async clearCustomerMemory(customerId: string): Promise<boolean> {
    try {
      const result = await this.executePythonScript('clear_memory', { customerId });
      return result.success || false;
    } catch (error) {
      console.error('Error clearing memory:', error);
      return false;
    }
  }

  async addCustomerProperties(customerId: string, properties: any[]): Promise<boolean> {
    try {
      const result = await this.executePythonScript('add_properties', {
        customerId,
        properties
      });
      return result.success || false;
    } catch (error) {
      console.error('Error adding properties:', error);
      return false;
    }
  }
}

// Global handler instance
let _chatbotHandler: ChatbotHandler | null = null;

export function getChatbotHandler(): ChatbotHandler {
  if (!_chatbotHandler) {
    _chatbotHandler = new ChatbotHandler();
  }
  return _chatbotHandler;
}

// For testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const handler = getChatbotHandler();
  
  handler.chatWithCustomer({
    message: "I'm looking for a 3-bedroom home under $600,000",
    customerId: "test_customer_123",
    customerProperties: [{
      address: "123 Main St, Test City, CA",
      price: "$500,000",
      bedrooms: 3,
      bathrooms: 2,
      property_type: "Single Family",
      city: "Test City",
      state: "CA",
      description: "Beautiful home with modern amenities"
    }]
  }).then(result => {
    console.log('Chat Result:', result);
  }).catch(error => {
    console.error('Error:', error);
  });
} 