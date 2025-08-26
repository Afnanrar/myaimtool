# 🚀 Facebook Webhook Setup Guide

This guide will help you set up Facebook webhooks for real-time message delivery to your MyAim My Dream tool.

## 📋 Prerequisites

- Facebook Developer Account
- Facebook App with Messenger permissions
- Vercel deployment with environment variables configured
- Supabase database set up

## 🔧 Step 1: Environment Variables

Add these environment variables to your Vercel project:

```bash
# Facebook App Configuration
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
FACEBOOK_WEBHOOK_VERIFY_TOKEN=your_custom_verify_token

# Database (should already be set)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### How to set in Vercel:
1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add each variable and redeploy

## 🎯 Step 2: Facebook App Configuration

### 2.1 Create/Update Facebook App
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or select existing app
3. Add "Messenger" product to your app

### 2.2 Configure Messenger Settings
1. In Messenger → Settings:
   - **Webhooks**: Click "Add Callback URL"
   - **Callback URL**: `https://your-domain.vercel.app/api/webhook`
   - **Verify Token**: Use the same value as `FACEBOOK_WEBHOOK_VERIFY_TOKEN`
   - **Webhook Fields**: Subscribe to:
     - `messages`
     - `messaging_postbacks`
     - `messaging_optins`
     - `message_deliveries`
     - `message_reads`

### 2.3 Generate Access Token
1. In Messenger → Settings → Access Tokens
2. Select your Facebook Page
3. Generate a page access token
4. Copy and save this token (you'll need it for page connection)

## 🌐 Step 3: Webhook Endpoint

Your webhook endpoint is already configured at `/api/webhook/route.ts` with:

- ✅ **GET**: Webhook verification for Facebook
- ✅ **POST**: Message processing and storage
- ✅ **Signature validation**: Security verification
- ✅ **Database integration**: Automatic message storage

## 🧪 Step 4: Test Your Webhook

### 4.1 Check Webhook Status
Visit: `https://your-domain.vercel.app/api/webhook-test`

Expected response:
```json
{
  "webhook_configured": true,
  "verify_token_set": true,
  "app_secret_set": true,
  "recent_messages_count": 0,
  "pages_connected": 1,
  "conversations_count": 0
}
```

### 4.2 Test Message Flow
1. **Send a message** to your Facebook Page from a user
2. **Check webhook logs** in Vercel function logs
3. **Verify database** - message should appear in conversations
4. **Check inbox** - new conversation should appear

## 🔍 Step 5: Troubleshooting

### Common Issues:

#### 1. Webhook Verification Fails
**Error**: "Webhook verification failed"
**Solution**: 
- Check `FACEBOOK_WEBHOOK_VERIFY_TOKEN` matches Facebook App settings
- Ensure webhook URL is accessible (no 404 errors)

#### 2. Invalid Signature
**Error**: "Invalid webhook signature"
**Solution**:
- Verify `FACEBOOK_APP_SECRET` is correct
- Check Facebook App settings match environment variables

#### 3. Page Not Found
**Error**: "Page not found in database"
**Solution**:
- Ensure Facebook Page is connected via your app
- Check page access token is valid
- Verify page exists in `pages` table

#### 4. Database Errors
**Error**: Database connection issues
**Solution**:
- Check Supabase connection
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set
- Check database tables exist

### Debug Steps:
1. **Check Vercel Logs**: Function execution logs
2. **Verify Environment**: Use `/api/webhook-test` endpoint
3. **Test Database**: Check Supabase connection
4. **Facebook App**: Verify webhook subscription

## 📱 Step 6: Monitor Webhook Activity

### Dashboard Status:
Your dashboard now shows real-time webhook status:
- 🟢 **Active**: Webhook receiving messages
- 🔵 **Configured**: Webhook set up but no recent activity
- 🟡 **Pending Setup**: Webhook not configured
- 🔴 **Error**: Webhook configuration issue

### Logs to Monitor:
- Webhook verification requests
- Incoming message processing
- Database operations
- Error messages and stack traces

## 🚀 Step 7: Production Deployment

### Security Checklist:
- ✅ Environment variables set in Vercel
- ✅ Webhook signature validation enabled
- ✅ HTTPS endpoint (Vercel provides this)
- ✅ Database access properly configured
- ✅ Error handling and logging implemented

### Performance Optimization:
- Webhook processes messages asynchronously
- Database operations are optimized
- Rate limiting implemented (100ms delays)
- Comprehensive error handling

## 🎉 Success Indicators

Your webhook is working when:
1. **Dashboard shows**: "Webhook: Active" (green)
2. **Messages appear instantly** in inbox without refresh
3. **Conversations update** in real-time
4. **No manual sync** required for incoming messages

## 🔄 Migration from Polling

Once webhook is active:
1. **Inbox will show**: "Webhook Active" instead of "Auto-Sync Active"
2. **Messages appear instantly** when users send them
3. **Real-time updates** without API polling
4. **Better performance** and user experience

## 📞 Support

If you encounter issues:
1. Check Vercel function logs
2. Verify environment variables
3. Test webhook endpoint manually
4. Check Facebook App configuration
5. Verify database connectivity

---

**🎯 Your webhook setup is now complete!** 

Messages will appear in real-time without manual refresh, providing a professional messaging experience for your users.
