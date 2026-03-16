function TermsOfService() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-500 mb-8">Effective Date: March 11, 2026</p>

        <div className="prose dark:prose-invert max-w-none space-y-6">
          <p>
            Welcome to <strong>sound.likeahe.ro</strong>. By using our website and services, you agree to be bound by these Terms of Service. Please read them carefully.
          </p>

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using our service, you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
            <p>
              We provide an AI-powered music generation platform that allows users to create songs from text prompts. Our service includes:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Music generation using Minimax AI models</li>
              <li>Library management for saving and organizing your creations</li>
              <li>Subscription-based access with usage limits</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. User Accounts</h2>
            <p>
              You must create an account to use our services. You are responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Maintaining the security of your account credentials</li>
              <li>All activities that occur under your account</li>
              <li>Providing accurate and complete information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Acceptable Use</h2>
            <p>You agree not to use our service to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Generate content that infringes on intellectual property rights</li>
              <li>Create illegal, harmful, or offensive content</li>
              <li>Violate any applicable laws or regulations</li>
              <li>Attempt to reverse engineer or hack our systems</li>
              <li>Share your account with unauthorized users</li>
              <li>Exceed your allocated usage limits</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Content and Intellectual Property</h2>
            <p>
              You retain ownership of any input prompts you provide. However:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>AI-generated music and lyrics are created using third-party models</li>
              <li>We make no claims regarding the copyright status of generated content</li>
              <li>You are responsible for ensuring your use of generated content complies with applicable laws</li>
              <li>You grant us a license to use your inputs solely for the purpose of providing our services</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Subscriptions and Payments</h2>
            <p>
              Our service operates on a subscription model. By subscribing:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>You agree to pay all applicable fees</li>
              <li>Subscriptions automatically renew unless canceled</li>
              <li>You may cancel at any time, but no refunds will be provided for partial periods</li>
              <li>We reserve the right to change pricing with notice</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. AI-Generated Content Disclosure</h2>
            <p>
              All music generated through our service is created using artificial intelligence. By using our service, you acknowledge that:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>You are responsible for disclosing AI-generated content when posting to third-party platforms (e.g., YouTube, Spotify, SoundCloud, social media)</li>
              <li>Many platforms require explicit labeling of AI-generated content</li>
              <li>Failure to disclose AI-generated content may violate platform policies and applicable laws</li>
              <li>You are solely responsible for compliance with the terms of service of any platform where you distribute generated content</li>
            </ul>
            <p className="mt-4">
              We recommend checking the specific disclosure requirements of each platform before posting AI-generated music.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Third-Party Services</h2>
            <p>
              Our service relies on Minimax for AI music generation. These services are subject to their own terms and conditions. We are not responsible for the availability or performance of Minimax.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of our services. Our total liability shall not exceed the amount you paid us in the past 12 months.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Disclaimer of Warranties</h2>
            <p>
              Our service is provided "as is" without warranties of any kind, either express or implied. We do not guarantee that the service will be uninterrupted, secure, or error-free, or that AI-generated content will meet your expectations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Termination</h2>
            <p>
              We may terminate or suspend your account at any time for violation of these terms. Upon termination, your right to use the service will immediately cease, and we may delete your data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Changes to Terms</h2>
            <p>
              We may modify these Terms of Service at any time. We will notify you of material changes. Your continued use of the service after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Governing Law</h2>
            <p>
              These Terms of Service shall be governed by and construed in accordance with the laws of the jurisdiction in which we operate, without regard to conflict of law principles.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">14. Contact Information</h2>
            <p>
              If you have any questions about these Terms of Service, please contact us at: <strong>info@lerimas.com</strong>
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}

export default TermsOfService
