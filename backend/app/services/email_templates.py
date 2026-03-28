"""
HTML email templates for onboarding emails.

Two templates:
1. Broker welcome — sent when admin creates a brokerage
2. Agent invitation — sent when brokerage admin invites an agent
"""


def _base_template(content: str, preview_text: str) -> str:
    """Wrap content in the base email layout."""
    return f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>ResidenceHive</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, a {{ -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
    table, td {{ mso-table-lspace: 0pt; mso-table-rspace: 0pt; }}
    img {{ -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }}
    body {{ margin: 0; padding: 0; width: 100% !important; height: 100% !important; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }}
    a[x-apple-data-detectors] {{ color: inherit !important; text-decoration: none !important; }}
    @media only screen and (max-width: 600px) {{
      .email-container {{ width: 100% !important; }}
      .px-mobile {{ padding-left: 24px !important; padding-right: 24px !important; }}
    }}
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="display: none; font-size: 1px; color: #f4f4f5; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    {preview_text}
  </div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <!--[if mso]>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" align="center"><tr><td>
        <![endif]-->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 560px; margin: 0 auto;" class="email-container">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding: 0 0 32px 0;">
              <span style="font-size: 20px; font-weight: 700; color: #18181b; letter-spacing: -0.02em;">&#x1F3E0; ResidenceHive</span>
            </td>
          </tr>
          <!-- Main card -->
          <tr>
            <td>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
                <tr><td style="background-color: #2563eb; height: 4px; font-size: 0; line-height: 0;">&nbsp;</td></tr>
                <tr>
                  <td style="padding: 40px 40px 40px 40px;" class="px-mobile">
                    {content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 28px 0 0 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="font-size: 12px; color: #a1a1aa; line-height: 1.6;">
                    ResidenceHive Inc.<br>
                    <a href="mailto:piyush@residencehive.com" style="color: #a1a1aa; text-decoration: underline;">piyush@residencehive.com</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>"""


def broker_welcome_email(broker_name: str, brokerage_name: str, signup_url: str) -> str:
    """Generate HTML for the broker welcome email."""
    content = f"""<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <!-- Greeting -->
      <tr>
        <td style="font-size: 22px; font-weight: 700; color: #18181b; line-height: 1.3; padding-bottom: 20px;">
          Your pilot is live, {broker_name}.
        </td>
      </tr>
      <!-- Pain point -->
      <tr>
        <td style="font-size: 15px; color: #3f3f46; line-height: 1.65; padding-bottom: 16px;">
          Every day, leads come in and go cold &mdash; not because your agents aren't working, but because buyers expect an instant, personalized response and generic listing emails don't deliver that.
        </td>
      </tr>
      <tr>
        <td style="font-size: 15px; color: #3f3f46; line-height: 1.65; padding-bottom: 16px;">
          <strong style="color: #18181b;">ResidenceHive changes that from day one.</strong>
        </td>
      </tr>
      <tr>
        <td style="font-size: 15px; color: #3f3f46; line-height: 1.65; padding-bottom: 24px;">
          The moment a lead comes in, your agents get an AI&#8209;powered buyer brief &mdash; personalized to that buyer, backed by live MLS data, and ready to send. No manual work. No delays. Just a response that makes buyers feel understood.
        </td>
      </tr>
      <!-- CTA Button -->
      <tr>
        <td style="padding-bottom: 28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="border-radius: 8px; background-color: #2563eb;">
                <a href="{signup_url}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                  Activate Your Account &rarr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Divider -->
      <tr><td style="border-top: 1px solid #e4e4e7; padding-bottom: 24px;"></td></tr>
      <!-- Steps -->
      <tr>
        <td style="font-size: 13px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.06em; padding-bottom: 16px;">
          Setup takes three steps
        </td>
      </tr>
      <tr>
        <td style="padding-bottom: 14px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td width="32" valign="top" style="font-size: 13px; font-weight: 700; color: #2563eb; padding-top: 1px;">01</td>
              <td style="font-size: 15px; color: #3f3f46; line-height: 1.55;">
                <strong style="color: #18181b;">Create your account</strong> &mdash; takes 30 seconds.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom: 14px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td width="32" valign="top" style="font-size: 13px; font-weight: 700; color: #2563eb; padding-top: 1px;">02</td>
              <td style="font-size: 15px; color: #3f3f46; line-height: 1.55;">
                <strong style="color: #18181b;">Add your agents</strong> &mdash; just enter their name and email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom: 24px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td width="32" valign="top" style="font-size: 13px; font-weight: 700; color: #2563eb; padding-top: 1px;">03</td>
              <td style="font-size: 15px; color: #3f3f46; line-height: 1.55;">
                <strong style="color: #18181b;">They're live on the next lead</strong> &mdash; AI buyer briefs start flowing.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Compliance note -->
      <tr>
        <td style="padding-bottom: 24px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd;">
            <tr>
              <td style="padding: 14px 18px; font-size: 14px; color: #0c4a6e; line-height: 1.5;">
                &#x2696;&#xFE0F; Fair Housing compliance is built in &mdash; your team is protected on every interaction.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Divider -->
      <tr><td style="border-top: 1px solid #e4e4e7; padding-bottom: 24px;"></td></tr>
      <!-- Personal sign-off -->
      <tr>
        <td style="font-size: 15px; color: #3f3f46; line-height: 1.65; padding-bottom: 8px;">
          Let's make this pilot count. Text or call me directly at <strong style="color: #18181b;">(860) 796-9167</strong> &mdash; I want to make sure your team gets value from day one.
        </td>
      </tr>
      <tr>
        <td style="font-size: 15px; color: #18181b; line-height: 1.65; padding-bottom: 4px;">
          <strong>Piyush</strong>
        </td>
      </tr>
      <tr>
        <td style="font-size: 14px; color: #71717a; line-height: 1.5;">
          Founder, ResidenceHive
        </td>
      </tr>
    </table>"""

    return _base_template(
        content,
        f"Your pilot for {brokerage_name} is live. Activate your account and start inviting agents."
    )


def agent_invitation_email(
    agent_name: str,
    broker_name: str,
    brokerage_name: str,
    invitation_url: str,
) -> str:
    """Generate HTML for the agent invitation email."""
    greeting = f"Hi {agent_name}," if agent_name else "Hi there,"

    content = f"""<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <!-- Context banner -->
      <tr>
        <td style="padding-bottom: 20px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe;">
            <tr>
              <td style="padding: 14px 18px; font-size: 14px; color: #1e40af; line-height: 1.5;">
                <strong>{broker_name}</strong> added you to <strong>{brokerage_name}</strong> on ResidenceHive.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Greeting -->
      <tr>
        <td style="font-size: 22px; font-weight: 700; color: #18181b; line-height: 1.3; padding-bottom: 16px;">
          {greeting}
        </td>
      </tr>
      <!-- Body -->
      <tr>
        <td style="font-size: 15px; color: #3f3f46; line-height: 1.65; padding-bottom: 24px;">
          {brokerage_name} is using ResidenceHive to turn leads into clients faster. Once you join, every new lead gets an AI&#8209;powered buyer brief &mdash; personalized, MLS&#8209;backed, and ready to send. No manual work.
        </td>
      </tr>
      <!-- CTA Button -->
      <tr>
        <td style="padding-bottom: 28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="border-radius: 8px; background-color: #2563eb;">
                <a href="{invitation_url}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                  Join Your Team &rarr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Divider -->
      <tr><td style="border-top: 1px solid #e4e4e7; padding-bottom: 24px;"></td></tr>
      <!-- What you'll get -->
      <tr>
        <td style="font-size: 13px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.06em; padding-bottom: 16px;">
          What you'll get
        </td>
      </tr>
      <tr>
        <td style="padding-bottom: 14px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td width="32" valign="top" style="font-size: 15px;">&#x1F4CB;</td>
              <td style="font-size: 15px; color: #3f3f46; line-height: 1.55;">
                <strong style="color: #18181b;">AI buyer briefs</strong> with real MLS data, tailored to each lead's budget and preferences.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom: 14px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td width="32" valign="top" style="font-size: 15px;">&#x1F4F1;</td>
              <td style="font-size: 15px; color: #3f3f46; line-height: 1.55;">
                <strong style="color: #18181b;">WhatsApp &amp; iMessage</strong> &mdash; manage leads and send briefs right from your phone.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom: 24px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td width="32" valign="top" style="font-size: 15px;">&#x2696;&#xFE0F;</td>
              <td style="font-size: 15px; color: #3f3f46; line-height: 1.55;">
                <strong style="color: #18181b;">Built&#8209;in compliance</strong> &mdash; Fair Housing flags and disclosure tracking handled for you.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Expiry -->
      <tr>
        <td>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fafafa; border-radius: 8px;">
            <tr>
              <td style="padding: 14px 18px; font-size: 13px; color: #71717a; line-height: 1.5;">
                Setup takes 2 minutes. This invitation expires in 7 days.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>"""

    return _base_template(
        content,
        f"{broker_name} added you to {brokerage_name} on ResidenceHive. Join your team."
    )
