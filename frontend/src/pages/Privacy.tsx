export function Privacy() {
  return (
    <div className="text-sm text-sage-700 leading-relaxed">
      <h1 className="text-xl font-semibold text-sage-800 mb-1">Privacy Policy</h1>
      <p className="text-xs text-sage-400 mb-6">Last updated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

      <p className="mb-3">
        This page explains what information Pordee Yoga collects through this booking site
        (including when opened inside the LINE app) and how it&apos;s used.
      </p>

      <h2 className="text-base font-semibold text-sage-800 mt-6 mb-2">Information we collect</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong>From LINE Login</strong> — when you log in, LINE shares your LINE user ID, display
          name, and profile photo with us so we can identify your account. We don&apos;t receive your
          LINE password or your friends/contacts list.
        </li>
        <li>
          <strong>Booking &amp; membership data</strong> — the classes you book or waitlist, the
          packages and credits you purchase, and any phone number or date of birth you choose to add
          to your profile.
        </li>
        <li>
          <strong>Payment data</strong> — package purchases and renewals are processed by our payment
          provider, Omise. We store the transaction reference and status, not your card or bank
          details.
        </li>
      </ul>

      <h2 className="text-base font-semibold text-sage-800 mt-6 mb-2">How we use it</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>To manage your bookings, class credits, waitlist position, and package renewals.</li>
        <li>To send you booking confirmations and class reminders via LINE messaging.</li>
        <li>To process package payments and refunds through Omise.</li>
        <li>To run the studio&apos;s day-to-day operations, such as class attendance records.</li>
      </ul>

      <h2 className="text-base font-semibold text-sage-800 mt-6 mb-2">Who we share it with</h2>
      <p className="mb-3">
        We share the minimum data needed with LINE (to send you messages) and Omise (to process
        payments). We don&apos;t sell your data or share it with anyone else for marketing purposes.
      </p>

      <h2 className="text-base font-semibold text-sage-800 mt-6 mb-2">How long we keep it</h2>
      <p className="mb-3">
        We keep your account and booking history for as long as you have an active membership or
        outstanding class credits, and for a reasonable period afterwards for accounting and dispute
        purposes.
      </p>

      <h2 className="text-base font-semibold text-sage-800 mt-6 mb-2">Your choices</h2>
      <p className="mb-3">
        You can ask us to correct your details or delete your account and booking history at any time
        by messaging us on our LINE Official Account. We&apos;ll action deletion requests unless we&apos;re
        required to keep certain records (e.g. payment records) for legal or accounting reasons.
      </p>

      <h2 className="text-base font-semibold text-sage-800 mt-6 mb-2">Changes to this policy</h2>
      <p className="mb-3">
        If this policy changes, we&apos;ll update this page and change the date above.
      </p>

      <h2 className="text-base font-semibold text-sage-800 mt-6 mb-2">Contact us</h2>
      <p>Questions about this policy? Message us on our LINE Official Account.</p>
    </div>
  );
}
