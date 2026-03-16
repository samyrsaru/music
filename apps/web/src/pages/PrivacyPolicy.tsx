function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-500 mb-8">Effective Date: March 11, 2026</p>

        <div className="prose dark:prose-invert max-w-none space-y-6">
          <p>
            <strong>sound.likeahe.ro</strong> ("we," "our," or "us") operates the sound.likeahe.ro website. 
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website.
          </p>

          <section>
            <h2 className="text-xl font-semibold mb-3">Information We Collect</h2>
            
            <h3 className="text-lg font-medium mb-2">Personal Information</h3>
            <p className="mb-4">
              When you create an account or use our services, we collect:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Email address</li>
              <li>Name (if provided)</li>
              <li>Subscription information (plan type, billing status)</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-medium mb-2">User Content</h3>
            <p>
              We store user-generated content, including songs you create and save to your library.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-medium mb-2">Technical & Analytics Data</h3>
            <p>
              We automatically collect certain technical information when you visit our website: IP address, browser type and version, device information, operating system, and usage data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide, maintain, and improve our services</li>
              <li>Process your subscriptions and payments</li>
              <li>Communicate with you about your account and our services</li>
              <li>Analyze usage patterns to enhance user experience</li>
              <li>Protect against fraud and abuse</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data Storage</h2>
            <p>
              Your personal information and user-generated content are stored on our secure cloud infrastructure. 
              We retain your data for as long as your account is active or as needed to provide you services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Third-Party Services</h2>
            <p>
              We work with third-party service providers to process payments and host our cloud infrastructure. 
              These providers have their own privacy policies governing their use of your information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">AI Content Generation</h2>
            <p>
              Our music generation service is powered by Minimax AI models. When you use our service, 
              your text prompts are sent to these AI providers for processing. We do not operate the AI models ourselves. 
              The generated music and lyrics are created by Minimax AI systems, and the terms and policies 
              of those providers apply to the generated content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your personal information 
              against unauthorized access, alteration, disclosure, or destruction.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Your Rights</h2>
            <p>You may:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access and download your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing of your data</li>
              <li>Export your data in a portable format</li>
            </ul>
            <p className="mt-4">
              To exercise these rights, contact us at <strong>info@lerimas.com</strong>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Children's Privacy</h2>
            <p>
              Our service is not intended for children under 13. We do not knowingly collect personal information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us at: <strong>info@lerimas.com</strong>
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}

export default PrivacyPolicy
