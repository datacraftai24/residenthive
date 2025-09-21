# SendGrid Email Setup Guide

## 🚨 Current Issue: 403 Forbidden Error

The SendGrid API is returning a 403 Forbidden error, which typically means:

### **Most Common Cause: Sender Email Verification**

SendGrid requires **sender verification** before allowing emails to be sent. This is a security feature to prevent spam.

## 🔧 **Quick Fix Options**

### **Option 1: Single Sender Verification (Recommended)**

1. **Log into SendGrid Dashboard**: https://app.sendgrid.com/
2. **Go to Settings** → **Sender Authentication** 
3. **Click "Single Sender Verification"**
4. **Add and verify your email address** (e.g., `noreply@yourdomain.com`)
5. **Check your email** and click the verification link
6. **Update environment variable**: `FROM_EMAIL=your-verified-email@domain.com`

### **Option 2: Domain Authentication (Production)**

1. **Go to Settings** → **Sender Authentication**
2. **Click "Domain Authentication"** 
3. **Add your domain** (e.g., `yourdomain.com`)
4. **Add DNS records** as instructed by SendGrid
5. **Verify domain ownership**

### **Option 3: Use SendGrid's Test Email**

For immediate testing, you can use SendGrid's sandbox mode or verified test emails.

## 🔍 **Debugging Steps**

### **Check API Key Permissions**

1. **Go to Settings** → **API Keys**
2. **Find your API key** and click to edit
3. **Ensure "Mail Send" permission** is enabled
4. **Regenerate key if needed**

### **Test Email Send via SendGrid Console**

1. **Go to Email API** → **Integration Guide**
2. **Try sending a test email** through their web interface
3. **Use the same FROM_EMAIL** you plan to use in the app

## 📧 **Current Configuration**

```bash
SENDGRID_API_KEY=SG.ffeUfzN... ✅ (Configured)
FROM_EMAIL=noreply@residenthive.com ❌ (Needs verification)
BASE_URL=http://localhost:5000 ✅ (Working)
```

## 🛠️ **Temporary Workaround**

The system gracefully handles email failures:

1. **Agent invites still work** - Setup URLs logged to console
2. **All functionality intact** - Agents can complete setup manually
3. **Professional templates ready** - Will work once SendGrid is configured

## ✅ **Verification Checklist**

- [ ] SendGrid account active
- [ ] API key has "Mail Send" permission  
- [ ] FROM_EMAIL address verified in SendGrid
- [ ] Single Sender Verification completed
- [ ] Test email sent successfully via SendGrid console

## 🚀 **Once Fixed**

After verification, the email system will:

- ✅ Send professional invitation emails
- ✅ Deliver welcome emails after activation  
- ✅ Use responsive HTML templates
- ✅ Include plain text fallbacks
- ✅ Provide branded ResidentHive design

## 💡 **Alternative Email Providers**

If SendGrid continues to have issues:

1. **AWS SES** - Very cost-effective ($0.10 per 1,000 emails)
2. **Resend** - Developer-friendly with React templates
3. **Mailgun** - Reliable with good free tier
4. **Postmark** - Excellent deliverability rates

---

**Current Status**: System fully functional, email delivery pending SendGrid verification