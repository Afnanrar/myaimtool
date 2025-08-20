export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-gray-600 mb-8">Last updated: August 2025</p>

          <div className="prose prose-gray max-w-none">
            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">1. Introduction</h2>
            <p className="text-gray-700 mb-6">
              Welcome to our Messenger Management Tool ("Service"). By accessing or using this Service, you agree to comply with these Terms of Service.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">2. Eligibility</h2>
            <p className="text-gray-700 mb-6">
              You must be at least 18 years old and an authorized admin of the Facebook Page you connect.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">3. Use of the Service</h2>
            <ul className="list-disc pl-6 text-gray-700 mb-6 space-y-2">
              <li>You may use the Service only to manage conversations and messaging for Pages you own or administer.</li>
              <li>You agree not to misuse the Service or attempt unauthorized access.</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">4. Data Handling</h2>
            <p className="text-gray-700 mb-6">
              The Service accesses and processes messages and Page data only with your explicit permission via Facebook Login. We do not sell or share your data with third parties.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">5. Limitation of Liability</h2>
            <p className="text-gray-700 mb-6">
              We are not responsible for any damages or losses resulting from your use of the Service. Use at your own risk.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">6. Modifications</h2>
            <p className="text-gray-700 mb-6">
              We may update these Terms from time to time. Continued use of the Service means you accept any changes.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">7. Contact</h2>
            <p className="text-gray-700 mb-6">
              If you have any questions about these Terms, contact us at{' '}
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
