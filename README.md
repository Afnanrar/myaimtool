# Facebook Messenger SaaS Tool

A comprehensive SaaS application for managing Facebook Page conversations, sending bulk messages, and engaging with your audience efficiently.

## Features

- **Conversation Management**: Centralize all Facebook Page conversations in one dashboard
- **Bulk Messaging**: Send personalized messages to multiple recipients with spintax support
- **Multi-Page Support**: Manage multiple Facebook Pages from a single interface
- **Real-time Updates**: Get instant notifications for new messages
- **Secure Authentication**: Facebook OAuth integration with JWT tokens
- **Webhook Support**: Receive real-time message updates from Facebook
- **Responsive Design**: Modern UI that works on all devices

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Facebook OAuth + JWT
- **Icons**: Lucide React
- **Real-time**: Supabase Realtime

## Prerequisites

- Node.js 18+ and npm
- Facebook Developer Account
- Supabase Account
- Domain/URL for webhook (ngrok for local development)

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd fb-messenger-tool
npm install
```

### 2. Facebook App Setup

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or use existing one
3. Add Facebook Login product
4. Configure OAuth settings:
   - Valid OAuth Redirect URIs: `http://localhost:3000/api/auth/callback`
   - App Domains: `localhost` (for development)
5. Add Messenger product
6. Configure webhook:
   - Callback URL: `https://yourdomain.com/api/webhook`
   - Verify Token: Create a secure random string
7. Subscribe to `messages` and `messaging_postbacks` events
8. Note down your App ID and App Secret

### 3. Supabase Setup

1. Create a new Supabase project
2. Run the following SQL to create tables:

```sql
-- Users table
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  facebook_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pages table
CREATE TABLE pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  facebook_page_id TEXT NOT NULL,
  name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversations table
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  facebook_conversation_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  participant_name TEXT NOT NULL,
  last_message_time TIMESTAMP WITH TIME ZONE NOT NULL,
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  facebook_message_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  message_text TEXT NOT NULL,
  attachments JSONB,
  is_from_page BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Broadcasts table
CREATE TABLE broadcasts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  recipient_count INTEGER NOT NULL,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'sending' CHECK (status IN ('sending', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Broadcast recipients table
CREATE TABLE broadcast_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  broadcast_id UUID REFERENCES broadcasts(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX idx_pages_user_id ON pages(user_id);
CREATE INDEX idx_conversations_page_id ON conversations(page_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_broadcasts_page_id ON broadcasts(page_id);
CREATE INDEX idx_broadcast_recipients_broadcast_id ON broadcast_recipients(broadcast_id);
```

3. Note down your Supabase URL and API keys

### 4. Environment Configuration

Copy `env.example` to `.env.local` and fill in your values:

```bash
cp env.example .env.local
```

```env
# Facebook App
NEXT_PUBLIC_FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
FACEBOOK_WEBHOOK_VERIFY_TOKEN=your_verify_token

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
JWT_SECRET=your_jwt_secret
```

### 5. Run the Application

```bash
npm run dev
```

Visit `http://localhost:3000` to see your application.

## Usage

### 1. Authentication
- Users click "Get Started" to authenticate with Facebook
- The app requests permissions for pages and messaging
- After authentication, users are redirected to the dashboard

### 2. Dashboard
- View statistics about connected pages, conversations, and broadcasts
- Quick access to inbox, broadcast, and settings

### 3. Inbox Management
- Select a Facebook page to view conversations
- Reply to messages in real-time
- Search and filter conversations

### 4. Broadcast Messages
- Send bulk messages to users who messaged within 24 hours
- Support for spintax message variations
- Track delivery status and results

### 5. Settings
- Manage connected Facebook pages
- View webhook configuration
- Disconnect pages when needed

## API Endpoints

- `GET /api/auth/login` - Facebook OAuth login
- `GET /api/auth/callback` - OAuth callback handler
- `GET /api/facebook/pages` - Get user's Facebook pages
- `GET /api/facebook/conversations` - Get page conversations
- `POST /api/facebook/messages` - Send a message
- `POST /api/facebook/broadcast` - Send bulk messages
- `GET/POST /api/webhook` - Facebook webhook handler

## Facebook Messaging Policy Compliance

- **24-Hour Rule**: Messages can only be sent to users who messaged within 24 hours
- **Rate Limiting**: Maximum 250 messages per second
- **Message Types**: Use `RESPONSE` for immediate replies, `MESSAGE_TAG` for after 24 hours
- **Webhook Verification**: Always verify webhook signatures

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

### Other Platforms

- Update `NEXT_PUBLIC_APP_URL` to your production domain
- Configure Facebook app with production URLs
- Set up Supabase production instance
- Configure webhook URL in Facebook app

## Security Considerations

- JWT tokens are stored in httpOnly cookies
- Webhook signatures are verified for all incoming requests
- Row Level Security (RLS) is enabled on all tables
- Access tokens are encrypted and stored securely
- Rate limiting is implemented for broadcast messages

## Troubleshooting

### Common Issues

1. **OAuth Redirect Error**: Ensure redirect URI matches exactly in Facebook app settings
2. **Webhook Verification Failed**: Check verify token and webhook URL
3. **Messages Not Sending**: Verify page access token and permissions
4. **Database Connection**: Check Supabase credentials and RLS policies

### Debug Mode

Enable debug logging by setting `NODE_ENV=development` and check browser console and server logs.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the GitHub repository
- Check the documentation
- Review Facebook Developer documentation

## Roadmap

- [ ] Advanced analytics and reporting
- [ ] Team collaboration features
- [ ] Message templates and automation
- [ ] Integration with other platforms
- [ ] Mobile app
- [ ] Advanced spintax features
- [ ] A/B testing for messages
- [ ] Customer segmentation
- [ ] API rate limiting dashboard
- [ ] Backup and restore functionality
