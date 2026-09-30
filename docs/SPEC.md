PICO — COMPLETE DEVELOPMENT SPECIFICATION
Build PICO, a simple international travel eSIM and connectivity app for iOS and Android.

This is a new, separate project. Create a dedicated PICO folder and private GitHub repository if authenticated access is available. Do not modify the DoorCustomizer repository. If GitHub access is unavailable, initialize Git locally and continue.

Act as a senior product designer, Flutter developer, backend architect, payments engineer, and quality lead. Implement working software in phases. Do not stop at a proposal or screen designs.

1. Product mission
Help customers:

Choose connectivity for their destination.

Understand exactly what they are buying.

Pay securely.

Install and activate their plan.

Check remaining allowances.

Get help easily.

Design for first-time eSIM users, older customers, international travelers, families, and business travelers.

Keep advanced technology behind the scenes. Never advertise capabilities that have not been verified with the integrated supplier and operating system.

2. Brand and approved icon
Use the supplied navy-background PICO icon, choice #3, as the approved app-icon artwork.

Preserve the mascot’s blue-green body, rounded silhouette, joyful expression, chrome headset, and recognizable identity.

The interface should use white backgrounds, deep navy text, blue primary controls, and green success accents. The navy icon does not require the entire app to use a dark interface.

Use large readable text, generous spacing, rounded cards, accessible contrast, and icons with labels.

Use the mascot sparingly for welcome, guidance, and successful setup. Respect reduced motion. Keep animations and sound optional.

If artwork is unavailable, use a clearly labeled temporary asset and continue.

3. Reference screenshots
Review the attached screenshots for customer friction. Create an original PICO interface.

Correct these issues:

Selecting a destination must not imply receiving a local phone number.

Clearly distinguish data, a phone number, calling minutes, and SMS.

Separate one-time purchases from subscriptions.

Explain verification before payment.

Distinguish payment, provisioning, installation, activation, and working internet.

Keep setup instructions inside PICO.

AI-chat screenshots demonstrate customer confusion; they are not authoritative provider documentation.

4. Navigation
Use exactly three primary tabs:

Travel.

My Plans.

Help.

Place account settings behind a profile button.

Each screen should have one clear main action. Preserve selections and progress when navigating backward, restarting the app, or returning from Settings.

5. Travel and plan selection
Begin with “Where are you going?”

Provide destination search. Ask for travel dates only when useful or necessary.

Allow browsing without signing in.

Then ask “What do you need?”

Internet.

Internet + calls and texts, where available.

Explain whether calls use the PICO app or native cellular service.

For number products, distinguish:

The number’s country code.

Countries the customer can call.

Where the service works.

Incoming and outgoing charges.

Supported SMS features.

Show local-number options only where actually available.

Initially show up to three suitable plans: Light Use, Everyday Use, and Heavy Use. Include “View all plans.”

Every plan must disclose:

Price and currency.

Allowance.

Duration.

Covered destinations.

Activation deadline.

When validity begins.

Calls and SMS, if included.

Relevant hotspot, speed, and fair-use restrictions.

Renewal terms, if applicable.

Use real supplier catalog information. Never invent savings, availability, or performance.

6. Compatibility and eligibility
Before payment, check available device capabilities and explain carrier-lock and regional-model limitations.

Classify information as:

Device verified.

Supplier reported.

Customer confirmed.

Unknown.

Never automatically mark “Unlocked,” “5G supported,” or the selected data SIM as confirmed without reliable evidence.

Explain required identity verification and documents before charging. Complete verification before payment where feasible. If a supplier requires another sequence, disclose it and define recovery/refund handling.

Provide a clear path for unsupported devices.

7. Checkout
Show one complete order summary:

Products included.

Total payable today.

Taxes and fees.

Future charges.

Renewal date, if applicable.

Activation and verification conditions.

Cancellation and refund terms.

No preselected paid extras. Keep marketing consent separate.

Use Stripe Payment Sheet with Apple Pay and Google Pay where available and configured.

Evaluate guest checkout with secure purchase recovery. If an account is required, keep sign-in brief and preserve the selected plan.

8. Arrival Assist and installation
After payment, show an accurate next step:

Payment received.

Preparing your plan.

Ready to install.

Installation unfinished.

Ready for arrival.

Activation pending.

Active.

Do not claim successful connection from payment or installation alone.

Build PICO Arrival Assist with:

Destination and purchased plan.

Pre-departure checklist.

Validity-start explanation.

Illustrated installation steps.

Travel data-line selection instructions.

Appropriate roaming guidance.

Connection check.

“I can’t connect.”

“Continue later.”

Support direct installation only where permitted. Provide QR and manual activation alternatives, including SM-DP+ details when supplied.

Explain how to install when the QR code is displayed on the same phone.

Do not imply eSIM profiles can always be transferred or reinstalled. Explain supplier restrictions before deletion.

A reachability test proves internet access, not necessarily that the PICO eSIM is carrying it.

9. My Plans
Show:

Destination and customer-defined plan name.

Setup status.

Remaining allowance.

Last usage update.

Expiry.

Phone number and calling balance, if purchased.

Renewal status.

Prominent actions:

Continue setup.

Top up.

Get help.

Show Phone and Messages controls only for supported purchased services.

Use authoritative supplier usage data. Label forecasts and estimates. Show unavailable or stale data honestly.

Automatic top-ups require explicit opt-in, spending caps, clear terms, duplicate-charge prevention, and an easy off switch.

Cache useful instructions and receipts offline. Secure activation credentials; exclude them from ordinary logs and analytics.

10. Help and support
Provide a visible “I can’t connect” action.

Guide customers through relevant checks:

Plan status.

Data-line selection.

Roaming setting.

APN, where applicable.

Coverage or supplier incident.

Expiry.

Remaining allowance.

Where automatic detection is unavailable, use illustrated checks and customer confirmation.

With permission, collect a redacted diagnostic summary for support.

Exclude identity images, payment information, activation codes, and unrelated device data.

Provide a practical human-support workflow. Do not claim 24/7 service without actual staffing.

11. Architecture
Mobile:

Flutter for iOS and Android.

One maintained state-management approach.

Suitable local persistence for non-sensitive cached data.

Secure platform storage for credentials.

Native integrations where required.

Backend:

TypeScript.

Node.js/Express on a validated compatible runtime.

Durable transactional database.

Queues for provisioning.

Database migrations.

Defined API contracts.

Choose one deployment architecture initially. Do not treat Cloudflare Workers, AWS Lambda, and Lambda@Edge as interchangeable.

Design for international expansion without prematurely building a complex globally writable system.

Inspect existing files and dependencies before making changes. Commit meaningful increments and add CI.

12. Environments and secrets
Separate development, test, staging, and production.

Use Stripe test mode and supplier sandboxes initially.

Commit an .env.example with placeholders only. Ignore real environment files and use deployment secret management.

Never embed payment secret keys, supplier credentials, webhook secrets, or database credentials in the mobile app.

Stripe publishable keys may be client-side; secret keys remain server-side.

Validate configuration at startup.

If a supplier lacks a sandbox, use an explicit mock adapter. Clearly label simulated results and prevent live purchases.

13. Payments and fulfillment
Use a PaymentIntent-based Payment Sheet integration for Sprint 1. Fulfill from verified payment_intent.succeeded events.

Do not provision from the client success screen.

The server determines eligibility, price, currency, tax, and supplier selection.

Verify webhook signatures using the required raw request body.

Persist webhook events durably, acknowledge promptly after durable receipt, and process fulfillment through a queue.

Implement:

Unique order IDs.

Persistent idempotency records.

Webhook deduplication.

Database uniqueness constraints.

Supplier idempotency where supported.

Controlled retries.

Uncertain-outcome reconciliation.

Refund handling.

Auditable administrative actions.

Model payment, provisioning, installation, and service activation separately.

A supplier timeout does not prove failure. Reconcile before retrying or switching suppliers.

One paid order must never generate duplicate eSIMs, numbers, top-ups, or refunds.

14. Security, privacy, and verification
Require server-side authorization for every user-owned resource.

Use secure sessions, short-lived access tokens, protected refresh handling, input validation, rate limits, and secure administrative access.

Integrate Apple App Attest and Google Play Integrity where supported, with server-side verification and risk-based handling.

Gracefully handle unsupported devices and temporary attestation failures. Do not treat attestation as an absolute jailbreak detector.

If using certificate pinning, define rotation, backup pins, and recovery.

Prefer provider-hosted identity capture. Minimize local identity-image handling and clean up on success, failure, and cancellation.

Store only justified provider references, verification status, expiry, and compliance metadata.

Define retention and deletion requirements before launch.

Do not claim security controls guarantee zero knowledge or prevent all cloning.

15. Suppliers, telephony, and platform limits
Start with one eSIM supplier behind a provider interface supporting:

Catalog.

Availability.

Provisioning.

Reconciliation.

Activation information.

Usage.

Top-ups.

Refund eligibility.

Status events.

Add suppliers after the first integration is reliable.

Select suppliers based on eligibility, coverage, reliability, capabilities, and margin.

Treat telephony as a separate integration. Define calling, messaging, number renewal, emergency-call limitations, abuse controls, and verification before exposing it.

Maintain reviewed country/product eligibility rules.

Capability-gate:

Direct eSIM installation.

Multi-network roaming.

Carrier-backed zero-data access.

Background usage updates.

Native calling and messaging.

Live Activities and widgets.

Do not promise ordinary app-controlled tower switching or simultaneous network bonding.

Require written carrier support for zero-data access. Provide offline help and Wi-Fi recovery.

Use practical platform-specific scanning and image-quality checks with accessible retry/help paths.

16. International accessibility and billing
Support screen readers, large text, reduced motion, right-to-left layouts, generous touch targets, and clear validation.

Keep language and currency independently selectable.

Use reviewed plain-language setup translations. Do not use flags as the sole language selector.

Show explicit dates and validity rules.

Generate receipts from actual transaction records. Implement jurisdiction-specific tax and invoice requirements before claiming tax compliance.

17. Phased implementation
Sprint 1:

Flutter app with three tabs.

Plan browsing.

Compatibility guidance.

Backend catalog and server-priced orders.

Stripe test Payment Sheet.

Verified webhook.

Durable order confirmation.

Explicit mock provisioning.

Failure and duplicate-event tests.

Sprint 2:

One real supplier integration.

Installation and activation guidance.

Arrival Assist.

Reconciliation.

Support operations.

Refund recovery.

Real-device validation.

Sprint 3:

Supplier usage reporting.

Top-ups.

Offline instructions and receipts.

Localization.

Accessibility validation.

Monitoring.

Multi-country Trip Mode.

Sprint 4:

Additional suppliers.

Eligible telephony.

Country-specific verification.

Family and business features.

Optional conversational assistance.

18. Testing and deliverables
Test:

Duplicate/out-of-order webhooks.

Failed/delayed payments.

Supplier timeout after possible fulfillment.

App termination and restart.

Interrupted installation.

Verification failure.

Unsupported devices.

Exhausted data.

Refund and cancellation recovery.

Validate usability with people of different ages, languages, and technical experience.

Target at least 90% unassisted plan-selection and test-checkout completion in representative usability testing. Report actual results; do not claim this target is achieved without evidence.

Measure setup completion, time to connect, provisioning failures, support resolution, and refund turnaround.

Deliver:

Working source.

Setup README.

Environment example.

Schema and migrations.

API contracts.

Capability matrix.

Test results.

Screenshots.

Recovery instructions.

Remaining credential, entitlement, and launch requirements.

Label features Implemented, Tested, Mocked, Provider-dependent, or Deferred.

19. Selected enhancements
Multi-country Trip Mode
Let customers enter destinations and dates.

Compare regional plans with separate country plans using supplier data.

Explain coverage, shared allowances, validity, voice/SMS availability, total price, and gaps.

Never automatically purchase another plan or switch SIMs without consent and platform support.

Contextual dashboard
Adapt My Plans to the products actually purchased.

Show one prominent next action. Display unavailable balances or status honestly, with timestamps.

Fraud prevention
Use available Stripe risk controls, purchase limits, account protections, and verified integrity signals.

Detect excessive payment attempts, abnormal purchase velocity, and provisioning abuse.

Do not reject travelers solely because of VPN use or differences between travel location and billing country.

Coordinate risk review with fulfillment. Provide a recovery path for legitimate customers.

Lightweight diagnostics
Start with a customer-triggered reachability and latency check.

Explain limitations. Obtain consent before larger speed tests and disclose estimated data use.

Avoid continuous testing and unnecessary location collection.

Optional PICO assistant
Build guided setup first.

Later add an assistant grounded in actual catalog data, approved instructions, and authenticated order information.

Acknowledge missing information. Never invent coverage or regulatory claims.

Require confirmation before purchases, top-ups, cancellations, or other consequential actions.

START NOW
Inspect the workspace, create the separate PICO project, save this specification in the repository, and implement Sprint 1 in test mode.

Continue useful work when credentials are missing, using clearly labeled mocks.

Do not enable live charging, publish app-store releases, or claim signed native builds without actual evidence.

If Xcode or signing is unavailable, complete the available implementation and document the remaining native build steps.

Keep the customer experience simple:

Choose a destination. Understand the plan. Pay securely. Follow the setup. Get connected. Find help easily.

