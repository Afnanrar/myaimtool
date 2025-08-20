# 🚀 Facebook Webhook Setup Guide

## Overview
This guide will help you set up Facebook webhooks to receive instant notifications when messages arrive on your Facebook Pages. This eliminates the need for polling and provides true real-time messaging.

## 🔑 Prerequisites

1. **Facebook App**: You need a Facebook App with Messenger permissions
2. **Page Access Token**: Valid access token for your Facebook Page
3. **Public HTTPS URL**: Your webhook endpoint must be publicly accessible
4. **Webhook Verify Token**: A secret token for webhook verification

## 📋 Step-by-Step Setup

### 1. Environment Variables

Add these to your `.env.local` file:

```bash
# Facebook Webhook Configuration
FACEBOOK_VERIFY_TOKEN=your_secret_webhook_token_here
FACEBOOK_APP_SECRET=your_facebook_app_secret
```

### 2. Facebook App Configuration

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Select your app
3. Go to **Messenger > Settings**
4. Under **Webhooks**, click **Add Callback URL**

### 3. Webhook Configuration

**Callback URL**: `https://your-domain.com/api/webhook`

**Verify Token**: Use the same value as `FACEBOOK_VERIFY_TOKEN`

**Webhook Fields**: Subscribe to these events:
- ✅ `messages` - When messages are sent to your page
- ✅ `messaging_deliveries` - When messages are delivered
- ✅ `messaging_reads` - When messages are read

### 4. Page Subscription

1. In your Facebook App, go to **Messenger > Settings**
2. Under **Page Subscriptions**, add your Facebook Page
3. Ensure the page has the required permissions

## 🔧 Webhook Endpoint

Your webhook endpoint is now available at:
```
GET  /api/webhook - Facebook verification
POST /api/webhook - Receives webhook events
```

## 📱 How It Works

### Webhook Flow:
1. **User sends message** to your Facebook Page
2. **Facebook immediately** sends webhook to your endpoint
3. **Your app processes** the message instantly
4. **Message appears** in inbox without refresh
5. **Real-time updates** via Supabase Realtime

### Event Types Handled:
- **New Messages**: Instant message delivery
- **Message Delivery**: Confirmation when messages are delivered
- **Message Reads**: When recipients read messages

## 🚨 Troubleshooting

### Common Issues:

1. **Webhook not verified**
   - Check `FACEBOOK_VERIFY_TOKEN` matches
   - Ensure endpoint is publicly accessible

2. **No webhook events**
   - Verify page subscription in Facebook App
   - Check webhook fields are subscribed
   - Ensure page has proper permissions

3. **Webhook errors**
   - Check server logs for errors
   - Verify database connection
   - Ensure all required fields are present

### Testing:

1. **Send test message** to your Facebook Page
2. **Check server logs** for webhook receipt
3. **Verify message appears** in inbox automatically
4. **Check database** for new records

## 🔒 Security

- **Verify Token**: Keep your webhook verify token secret
- **HTTPS Only**: Webhooks only work over HTTPS
- **Signature Verification**: Facebook signs webhook payloads
- **Rate Limiting**: Implement if needed for high volume

## 📊 Benefits

✅ **Instant Delivery**: Messages appear immediately
✅ **No Polling**: Eliminates API rate limit concerns
✅ **Real-Time**: True real-time messaging experience
✅ **Professional**: Enterprise-grade messaging platform
✅ **Efficient**: Reduces server load and API calls

## 🔄 Migration from Polling

Once webhooks are working:

1. **Keep polling as backup** for reliability
2. **Reduce polling frequency** to save resources
3. **Monitor webhook delivery** rates
4. **Gradually transition** to webhook-only

## 📞 Support

If you encounter issues:
1. Check Facebook App settings
2. Verify environment variables
3. Review server logs
4. Test webhook endpoint manually

---

**Next Steps**: After setting up webhooks, your inbox will receive messages instantly when users message your Facebook Page!
