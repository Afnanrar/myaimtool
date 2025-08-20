# Facebook Webhook Setup for Real-time Messages

## 🔧 **Environment Variables Required**

Add these to your `.env.local` file:

```bash
# Facebook Webhook Configuration
FACEBOOK_WEBHOOK_VERIFY_TOKEN=your_custom_verify_token_here
```

## 📱 **Facebook App Configuration**

### 1. **Set Webhook URL**
- Go to [Facebook Developers](https://developers.facebook.com/)
- Select your app
- Go to **Webhooks** section
- Add webhook URL: `https://your-app.vercel.app/api/webhook/facebook`
- Verify Token: Use the same value as `FACEBOOK_WEBHOOK_VERIFY_TOKEN`

### 2. **Subscribe to Events**
Subscribe to these webhook events:
- `messages` - For incoming messages
- `messaging_postbacks` - For button clicks
- `message_deliveries` - For delivery confirmations

### 3. **Page Access Token**
Ensure your page has these permissions:
- `pages_messaging`
- `pages_read_engagement`
- `pages_manage_metadata`

## 🚀 **How It Works**

1. **Real-time Updates**: Supabase real-time subscriptions
2. **Webhook Fallback**: Facebook webhooks for instant updates
3. **Periodic Refresh**: 30-second fallback if real-time fails
4. **Message Caching**: Instant conversation switching

## ✅ **Testing**

1. **Send message from Facebook to your page**
2. **Message should appear instantly in inbox**
3. **Unread count should update immediately**
4. **No manual refresh needed**

## 🔍 **Troubleshooting**

- Check Vercel logs for webhook errors
- Verify webhook URL is accessible
- Ensure Facebook app is in production mode
- Check Supabase real-time is enabled
