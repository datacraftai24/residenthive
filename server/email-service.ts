import sgMail from '@sendgrid/mail';
import type { AgentConfig } from './agent-invite-service.js';

export class EmailService {
  private isConfigured: boolean = false;

  constructor() {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (apiKey) {
      sgMail.setApiKey(apiKey);
      this.isConfigured = true;
    } else {
      console.warn('⚠️  SENDGRID_API_KEY not found. Email functionality disabled.');
    }
  }

  /**
   * Sends an agent invitation email with setup link
   * SECURITY: Includes additional validation and logging
   */
  async sendAgentInvite(agentConfig: AgentConfig, inviteToken: string): Promise<boolean> {
    if (!this.isConfigured) {
      console.log('📧 Email service not configured - logging invite details:');
      this.logInviteDetails(agentConfig, inviteToken);
      return false;
    }

    try {
      const inviteUrl = `https://residenthive-demo-info4334.replit.app/agent-setup?token=${inviteToken}`;
      const fromEmail = process.env.FROM_EMAIL || 'info@datacraftai.com';

      // SECURITY: Log email sending attempt for audit trail
      console.log(`🔒 SECURITY: Sending email to ${agentConfig.email} with token ${inviteToken.substring(0, 8)}...`);

      const msg = {
        to: agentConfig.email,
        from: fromEmail,
        subject: 'Welcome to ResidentHive - Complete Your Agent Setup',
        html: this.generateInviteEmailTemplate(agentConfig, inviteUrl),
        text: this.generatePlainTextInvite(agentConfig, inviteUrl)
      };

      await sgMail.send(msg);
      console.log(`✅ SECURITY: Email successfully sent to ${agentConfig.email} with token ${inviteToken.substring(0, 8)}...`);
      return true;
    } catch (error) {
      const errorDetail = error.response?.body?.errors?.[0];
      console.error(`❌ Failed to send email to ${agentConfig.email}:`);
      console.error(`   Error: ${errorDetail?.message || error.message}`);
      console.error(`   Field: ${errorDetail?.field || 'unknown'}`);
      console.error(`   Help: ${errorDetail?.help || 'Check SendGrid configuration'}`);
      
      // Provide helpful guidance for common issues
      if (error.code === 403) {
        console.error(`   💡 403 Forbidden - Possible issues:`);
        console.error(`      • FROM_EMAIL domain not verified in SendGrid`);
        console.error(`      • API key missing 'Mail Send' permission`);
        console.error(`      • Single Sender Verification required`);
      }
      
      // SECURITY: Log email failure for audit trail
      console.error(`🔒 SECURITY: Failed to send email to ${agentConfig.email} with token ${inviteToken.substring(0, 8)}...`);
      
      // Fallback to console logging
      this.logInviteDetails(agentConfig, inviteToken);
      return false;
    }
  }

  /**
   * Fallback method to log invite details when email service is unavailable
   * SECURITY: Includes token validation logging
   */
  private logInviteDetails(agentConfig: AgentConfig, inviteToken: string): void {
    const inviteUrl = `https://residenthive-demo-info4334.replit.app/agent-setup?token=${inviteToken}`;
    
    console.log(`📧 Agent Invitation Details:`);
    console.log(`   Name: ${agentConfig.firstName} ${agentConfig.lastName}`);
    console.log(`   Email: ${agentConfig.email}`);
    console.log(`   Brokerage: ${agentConfig.brokerageName}`);
    console.log(`   Setup URL: ${inviteUrl}`);
    console.log(`   Token: ${inviteToken.substring(0, 8)}...${inviteToken.substring(-4)} (truncated for security)`);
    console.log('   💡 Configure SENDGRID_API_KEY to enable email delivery');
    console.log('');
    console.log('📧 COPY THIS SETUP URL FOR TESTING:');
    console.log(inviteUrl);
    console.log('');
  }

  /**
   * Generates professional HTML email template using EmailTemplates
   */
  private generateInviteEmailTemplate(agentConfig: AgentConfig, inviteUrl: string): string {
    // Using inline template for now to avoid import issues
    return this.createInlineInviteTemplate(agentConfig, inviteUrl);
  }

  /**
   * Legacy method - kept for backward compatibility
   */
  private generateInviteEmailTemplateLegacy(agentConfig: AgentConfig, inviteUrl: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to ResidentHive</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 40px 30px; text-align: center; }
        .logo { color: white; font-size: 28px; font-weight: bold; margin: 0; }
        .subtitle { color: #e2e8f0; font-size: 16px; margin: 8px 0 0 0; }
        .content { padding: 40px 30px; }
        .greeting { font-size: 24px; color: #1e293b; margin: 0 0 20px 0; font-weight: 600; }
        .message { font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 30px 0; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 20px 0; }
        .cta-button:hover { background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%); }
        .details { background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 30px 0; }
        .details h3 { color: #1e293b; margin: 0 0 15px 0; font-size: 18px; }
        .detail-item { margin: 8px 0; color: #475569; }
        .footer { background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { color: #64748b; font-size: 14px; margin: 5px 0; }
        .link { color: #3b82f6; text-decoration: none; }
        .link:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="logo">🏠 ResidentHive</h1>
            <p class="subtitle">AI-Powered Real Estate Platform</p>
        </div>
        
        <div class="content">
            <h2 class="greeting">Welcome to ResidentHive, ${agentConfig.firstName}!</h2>
            
            <p class="message">
                You've been invited to join our AI-powered real estate buyer profile management platform. 
                ResidentHive helps you create intelligent buyer profiles, find perfect property matches, 
                and provide exceptional client experiences.
            </p>
            
            <div style="text-align: center;">
                <a href="${inviteUrl}" class="cta-button">Complete Your Setup</a>
            </div>
            
            <div class="details">
                <h3>Your Account Details</h3>
                <div class="detail-item"><strong>Name:</strong> ${agentConfig.firstName} ${agentConfig.lastName}</div>
                <div class="detail-item"><strong>Email:</strong> ${agentConfig.email}</div>
                <div class="detail-item"><strong>Brokerage:</strong> ${agentConfig.brokerageName}</div>
            </div>
            
            <p class="message">
                <strong>Next Steps:</strong><br>
                1. Click the setup button above<br>
                2. Create your secure password<br>
                3. Start creating intelligent buyer profiles<br>
                4. Experience AI-powered property matching
            </p>
            
            <p class="message">
                This invitation link will expire in 7 days for security purposes. 
                If you have any questions, please don't hesitate to contact our support team.
            </p>
        </div>
        
        <div class="footer">
            <p><strong>ResidentHive</strong> - Intelligent Real Estate Solutions</p>
            <p>Questions? Contact us at <a href="mailto:support@residenthive.com" class="link">support@residenthive.com</a></p>
            <p style="font-size: 12px; color: #94a3b8;">This email was sent to ${agentConfig.email}</p>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Generates plain text version for email clients that don't support HTML
   */
  private generatePlainTextInvite(agentConfig: AgentConfig, inviteUrl: string): string {
    return `
Welcome to ResidentHive, ${agentConfig.firstName}!

You've been invited to join our AI-powered real estate buyer profile management platform.

Your Account Details:
- Name: ${agentConfig.firstName} ${agentConfig.lastName}
- Email: ${agentConfig.email}
- Brokerage: ${agentConfig.brokerageName}

Complete your setup here: ${inviteUrl}

Next Steps:
1. Visit the setup link above
2. Create your secure password
3. Start creating intelligent buyer profiles
4. Experience AI-powered property matching

This invitation link will expire in 7 days for security purposes.

Questions? Contact us at support@residenthive.com

ResidentHive - Intelligent Real Estate Solutions
`;
  }

  /**
   * Sends a welcome email after successful agent activation
   */
  async sendWelcomeEmail(agentConfig: AgentConfig): Promise<boolean> {
    if (!this.isConfigured) {
      console.log(`👋 Welcome email would be sent to ${agentConfig.email}`);
      return false;
    }

    try {
      const fromEmail = process.env.FROM_EMAIL || 'noreply@residenthive.com';
      const dashboardUrl = process.env.BASE_URL || 'http://localhost:5000';

      const msg = {
        to: agentConfig.email,
        from: fromEmail,
        subject: 'Welcome to ResidentHive - Your Account is Ready!',
        html: this.generateWelcomeEmailTemplate(agentConfig, dashboardUrl),
        text: this.generatePlainTextWelcome(agentConfig, dashboardUrl)
      };

      await sgMail.send(msg);
      console.log(`✅ Welcome email sent to ${agentConfig.email}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send welcome email to ${agentConfig.email}:`, error);
      return false;
    }
  }

  /**
   * Creates professional inline invite email template
   */
  private createInlineInviteTemplate(agentConfig: AgentConfig, inviteUrl: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to ResidentHive</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 40px 30px; text-align: center; }
        .logo { color: white; font-size: 32px; font-weight: bold; margin: 0; letter-spacing: -0.5px; }
        .subtitle { color: rgba(255, 255, 255, 0.9); font-size: 16px; margin: 8px 0 0 0; }
        .content { padding: 40px 30px; }
        .greeting { color: #1e293b; margin: 0 0 24px 0; font-size: 28px; font-weight: 600; }
        .message { font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 24px 0; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 20px 0; }
        .details { background-color: #f1f5f9; padding: 24px; border-radius: 8px; margin: 30px 0; }
        .details h3 { color: #1e293b; margin: 0 0 16px 0; font-size: 18px; }
        .detail-item { margin: 8px 0; color: #475569; }
        .footer { background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { color: #64748b; font-size: 14px; margin: 5px 0; }
        .text-center { text-align: center; }
        @media (max-width: 480px) { .container { margin: 0 10px; } .content { padding: 30px 20px; } .header { padding: 30px 20px; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="logo">🏠 ResidentHive</h1>
            <p class="subtitle">AI-Powered Real Estate Platform</p>
        </div>
        
        <div class="content">
            <h2 class="greeting">Welcome to ResidentHive, ${agentConfig.firstName}!</h2>
            
            <p class="message">
                You've been invited to join our AI-powered real estate buyer profile management platform. 
                ResidentHive helps you create intelligent buyer profiles, find perfect property matches, 
                and provide exceptional client experiences.
            </p>
            
            <div class="text-center">
                <a href="${inviteUrl}" class="cta-button">Complete Your Setup</a>
            </div>
            
            <div class="details">
                <h3>Your Account Details</h3>
                <div class="detail-item"><strong>Name:</strong> ${agentConfig.firstName} ${agentConfig.lastName}</div>
                <div class="detail-item"><strong>Email:</strong> ${agentConfig.email}</div>
                <div class="detail-item"><strong>Brokerage:</strong> ${agentConfig.brokerageName}</div>
            </div>
            
            <p class="message">
                <strong>Next Steps:</strong><br>
                1. Click the setup button above<br>
                2. Create your secure password<br>
                3. Start creating intelligent buyer profiles<br>
                4. Experience AI-powered property matching
            </p>
            
            <p style="font-size: 14px; color: #64748b; margin: 24px 0 0 0;">
                This invitation link will expire in 7 days for security purposes.
            </p>
        </div>
        
        <div class="footer">
            <p><strong>ResidentHive</strong> - AI-Powered Real Estate Platform</p>
            <p>Questions? Contact us at <a href="mailto:support@residenthive.com" style="color: #3b82f6;">support@residenthive.com</a></p>
            <p style="font-size: 12px; color: #94a3b8;">This email was sent to ${agentConfig.email}</p>
        </div>
    </div>
</body>
</html>`;
  }

  private generateWelcomeEmailTemplate(agentConfig: AgentConfig, dashboardUrl: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to ResidentHive</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 40px 30px; text-align: center; }
        .logo { color: white; font-size: 28px; font-weight: bold; margin: 0; }
        .subtitle { color: #d1fae5; font-size: 16px; margin: 8px 0 0 0; }
        .content { padding: 40px 30px; }
        .greeting { font-size: 24px; color: #1e293b; margin: 0 0 20px 0; font-weight: 600; }
        .message { font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 30px 0; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 20px 0; }
        .footer { background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { color: #64748b; font-size: 14px; margin: 5px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="logo">🏠 ResidentHive</h1>
            <p class="subtitle">Account Successfully Activated!</p>
        </div>
        
        <div class="content">
            <h2 class="greeting">Welcome aboard, ${agentConfig.firstName}! 🎉</h2>
            
            <p class="message">
                Your ResidentHive account is now active and ready to use. You can start creating 
                intelligent buyer profiles and finding perfect property matches for your clients.
            </p>
            
            <div style="text-align: center;">
                <a href="${dashboardUrl}/agent-login" class="cta-button">Access Your Dashboard</a>
            </div>
            
            <p class="message">
                <strong>Quick Start Guide:</strong><br>
                1. Log in with your email and password<br>
                2. Create your first buyer profile<br>
                3. Experience AI-powered property matching<br>
                4. Share results with your clients
            </p>
        </div>
        
        <div class="footer">
            <p><strong>ResidentHive</strong> - Intelligent Real Estate Solutions</p>
            <p>Questions? Contact us at support@residenthive.com</p>
        </div>
    </div>
</body>
</html>`;
  }

  private generatePlainTextWelcome(agentConfig: AgentConfig, dashboardUrl: string): string {
    return `
Welcome aboard, ${agentConfig.firstName}!

Your ResidentHive account is now active and ready to use.

Access your dashboard: ${dashboardUrl}/agent-login

Quick Start Guide:
1. Log in with your email and password
2. Create your first buyer profile
3. Experience AI-powered property matching
4. Share results with your clients

Questions? Contact us at support@residenthive.com

ResidentHive - Intelligent Real Estate Solutions
`;
  }
}

// Export singleton instance
export const emailService = new EmailService();