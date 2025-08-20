export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-gray-600 mb-8">Last updated: August 2025</p>

          <div className="prose prose-gray max-w-none">
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">1. Introduction</h2>
            <p className="text-gray-700 mb-6">
              We value your privacy. This Privacy Policy explains how we collect, use, and protect information when you use our Messenger Management Tool ("Service").
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">2. Information We Collect</h2>
            <ul className="list-disc pl-6 text-gray-700 mb-6 space-y-2">
              <li>Facebook Page data you authorize via Facebook Login (such as messages, Page ID, and profile info).</li>
              <li>Basic usage data (like login times and connected accounts).</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">3. How We Use Information</h2>
            <ul className="list-disc pl-6 text-gray-700 mb-6 space-y-2">
              <li>To allow Page admins to read and reply to messages.</li>
              <li>To enable broadcast messaging features.</li>
              <li>To improve Service performance and security.</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">4. Data Sharing</h2>
            <p className="text-gray-700 mb-6">
              We do not sell, rent, or trade your data. Data is only shared with Facebook as required by their API.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">5. Data Security</h2>
            <p className="text-gray-700 mb-6">
              We use standard security measures to protect your data. However, no method is 100% secure, and we cannot guarantee absolute security.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">6. Your Rights</h2>
            <p className="text-gray-700 mb-6">
              You may revoke access at any time from your Facebook account settings. You can also request data deletion by contacting us.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">7. Contact</h2>
            <p className="text-gray-700 mb-6">
              For privacy questions or data deletion requests, email us at{' '}
              <a 
                href="mailto:info@myaimmydream.com" 
                className="text-blue-600 hover:text-blue-800 underline"
              >
                info@myaimmydream.com
              </a>.
            </p>
          </div>

          <div className="mt-12 pt-6 border-t border-gray-200">
            <a 
              href="/dashboard" 
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              ← Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
