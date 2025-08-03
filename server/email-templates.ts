/**
 * Professional email templates for ResidentHive
 */

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailTemplates {
  /**
   * Creates branded email template with consistent styling
   */
  static createTemplate(
    title: string,
    headerColor: string,
    headerText: string,
    content: string,
    ctaButton?: { text: string; url: string; color: string }
  ): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .header { background: ${headerColor}; padding: 40px 30px; text-align: center; }
        .logo { color: white; font-size: 32px; font-weight: bold; margin: 0; letter-spacing: -0.5px; }
        .subtitle { color: rgba(255, 255, 255, 0.9); font-size: 16px; margin: 8px 0 0 0; }
        .content { padding: 40px 30px; }
        .cta-button { 
            display: inline-block; 
            background: ${ctaButton?.color || '#3b82f6'}; 
            color: white; 
            text-decoration: none; 
            padding: 16px 32px; 
            border-radius: 8px; 
            font-weight: 600; 
            font-size: 16px; 
            margin: 20px 0;
            transition: all 0.2s ease;
        }
        .cta-button:hover { filter: brightness(1.1); }
        .footer { background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { color: #64748b; font-size: 14px; margin: 5px 0; }
        .text-center { text-align: center; }
        .mb-4 { margin-bottom: 24px; }
        .text-gray-600 { color: #64748b; }
        .text-gray-800 { color: #1e293b; }
        .font-semibold { font-weight: 600; }
        @media (max-width: 480px) {
            .container { margin: 0 10px; }
            .content { padding: 30px 20px; }
            .header { padding: 30px 20px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="logo">🏠 ResidentHive</h1>
            <p class="subtitle">${headerText}</p>
        </div>
        
        <div class="content">
            ${content}
            ${ctaButton ? `
            <div class="text-center">
                <a href="${ctaButton.url}" class="cta-button">${ctaButton.text}</a>
            </div>
            ` : ''}
        </div>
        
        <div class="footer">
            <p><strong>ResidentHive</strong> - AI-Powered Real Estate Platform</p>
            <p>Questions? Contact us at <a href="mailto:support@residenthive.com" style="color: #3b82f6;">support@residenthive.com</a></p>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Agent invitation email template
   */
  static getAgentInvitation(agentConfig: { firstName: string; lastName: string; email: string; brokerageName: string }, inviteUrl: string): EmailTemplate {
    const content = `
      <h2 style="color: #1e293b; margin: 0 0 24px 0; font-size: 28px; font-weight: 600;">
        Welcome to ResidentHive, ${agentConfig.firstName}!
      </h2>
      
      <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
        You've been invited to join our AI-powered real estate buyer profile management platform. 
        ResidentHive helps you create intelligent buyer profiles, find perfect property matches, 
        and provide exceptional client experiences.
      </p>
      
      <div style="background-color: #f1f5f9; padding: 24px; border-radius: 8px; margin: 30px 0;">
        <h3 style="color: #1e293b; margin: 0 0 16px 0; font-size: 18px;">Your Account Details</h3>
        <div style="margin: 8px 0; color: #475569;">
          <strong>Name:</strong> ${agentConfig.firstName} ${agentConfig.lastName}
        </div>
        <div style="margin: 8px 0; color: #475569;">
          <strong>Email:</strong> ${agentConfig.email}
        </div>
        <div style="margin: 8px 0; color: #475569;">
          <strong>Brokerage:</strong> ${agentConfig.brokerageName}
        </div>
      </div>
      
      <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
        <strong>Next Steps:</strong><br>
        1. Click the setup button below<br>
        2. Create your secure password<br>
        3. Start creating intelligent buyer profiles<br>
        4. Experience AI-powered property matching
      </p>
      
      <p style="font-size: 14px; color: #64748b; margin: 24px 0 0 0;">
        This invitation link will expire in 7 days for security purposes.
      </p>
    `;

    return {
      subject: 'Welcome to ResidentHive - Complete Your Agent Setup',
      html: this.createTemplate(
        'Welcome to ResidentHive',
        'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
        'AI-Powered Real Estate Platform',
        content,
        { text: 'Complete Your Setup', url: inviteUrl, color: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }
      ),
      text: `Welcome to ResidentHive, ${agentConfig.firstName}!

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
ResidentHive - AI-Powered Real Estate Platform`
    };
  }

  /**
   * Welcome email after account activation
   */
  static getWelcomeEmail(agentConfig: { firstName: string; lastName: string; email: string; brokerageName: string }, dashboardUrl: string): EmailTemplate {
    const content = `
      <h2 style="color: #1e293b; margin: 0 0 24px 0; font-size: 28px; font-weight: 600;">
        Welcome aboard, ${agentConfig.firstName}! 🎉
      </h2>
      
      <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
        Your ResidentHive account is now active and ready to use. You can start creating 
        intelligent buyer profiles and finding perfect property matches for your clients.
      </p>
      
      <div style="background-color: #ecfdf5; padding: 24px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #059669;">
        <h3 style="color: #065f46; margin: 0 0 16px 0; font-size: 18px;">Quick Start Guide</h3>
        <ol style="color: #047857; margin: 0; padding-left: 20px;">
          <li style="margin: 8px 0;">Log in with your email and password</li>
          <li style="margin: 8px 0;">Create your first buyer profile</li>
          <li style="margin: 8px 0;">Experience AI-powered property matching</li>
          <li style="margin: 8px 0;">Share results with your clients</li>
        </ol>
      </div>
      
      <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
        Our AI analyzes buyer preferences, finds perfect matches, and generates professional 
        client presentations - saving you hours while improving client satisfaction.
      </p>
    `;

    return {
      subject: 'Welcome to ResidentHive - Your Account is Ready!',
      html: this.createTemplate(
        'Account Ready',
        'linear-gradient(135deg, #059669 0%, #047857 100%)',
        'Account Successfully Activated!',
        content,
        { text: 'Access Your Dashboard', url: `${dashboardUrl}/agent-login`, color: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }
      ),
      text: `Welcome aboard, ${agentConfig.firstName}!

Your ResidentHive account is now active and ready to use.

Access your dashboard: ${dashboardUrl}/agent-login

Quick Start Guide:
1. Log in with your email and password
2. Create your first buyer profile  
3. Experience AI-powered property matching
4. Share results with your clients

Questions? Contact us at support@residenthive.com
ResidentHive - AI-Powered Real Estate Platform`
    };
  }

  /**
   * Password reset email template
   */
  static getPasswordReset(agentName: string, resetUrl: string): EmailTemplate {
    const content = `
      <h2 style="color: #1e293b; margin: 0 0 24px 0; font-size: 28px; font-weight: 600;">
        Password Reset Request
      </h2>
      
      <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
        Hi ${agentName}, we received a request to reset your ResidentHive password.
      </p>
      
      <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
        If you requested this change, click the button below to set a new password. 
        If you didn't request this, you can safely ignore this email.
      </p>
      
      <p style="font-size: 14px; color: #64748b; margin: 24px 0 0 0;">
        This password reset link will expire in 1 hour for security purposes.
      </p>
    `;

    return {
      subject: 'Reset Your ResidentHive Password',
      html: this.createTemplate(
        'Password Reset',
        'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
        'Password Reset Request',
        content,
        { text: 'Reset Password', url: resetUrl, color: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' }
      ),
      text: `Password Reset Request

Hi ${agentName}, we received a request to reset your ResidentHive password.

If you requested this change, visit this link to set a new password: ${resetUrl}

If you didn't request this, you can safely ignore this email.

This password reset link will expire in 1 hour for security purposes.

ResidentHive - AI-Powered Real Estate Platform`
    };
  }
}