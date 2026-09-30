import 'dart:async';
import 'package:flutter/material.dart';
import '../api.dart';
import '../order_store.dart';
import '../theme.dart';

/// Compatibility + checkout + order status (spec §6, §7, §8).
/// Detection is honest: we never claim unlocked/eSIM-capable without evidence —
/// unavailable checks use illustrated guidance and customer confirmation.
class CheckoutScreen extends StatefulWidget {
  final ApiClient api;
  final OrderStore store;
  final Plan plan;
  final VoidCallback onPurchased;
  const CheckoutScreen({super.key, required this.api, required this.store,
      required this.plan, required this.onPurchased});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  bool _esimConfirmed = false;
  bool _unlockedConfirmed = false;
  bool _busy = false;
  String? _error;
  CreateOrderResult? _result;

  bool get _ready => _esimConfirmed && _unlockedConfirmed;

  Future<void> _createOrder() async {
    setState(() { _busy = true; _error = null; });
    try {
      final r = await widget.api.createOrder(
        planId: widget.plan.planId,
        destination: widget.plan.destination,
        idempotencyKey: 'order-${DateTime.now().microsecondsSinceEpoch}',
      );
      setState(() => _result = r);
    } catch (e) {
      setState(() => _error = 'Could not create your order. Nothing was charged.');
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _pay() async {
    final r = _result!;
    if (r.payment.mock) {
      // TEST MODE: no real charge possible. Drive the signed webhook path and
      // move on to the order status screen — payment is confirmed server-side.
      await widget.api.confirmPayment(r.order.id);
      await widget.store.add(r.order.id);
      if (mounted) {
        Navigator.pushReplacement(context, MaterialPageRoute(
          builder: (_) => OrderStatusScreen(api: widget.api, orderId: r.order.id,
              onDone: widget.onPurchased)));
      }
      return;
    }
    // Real path (Provider-dependent): Stripe Payment Sheet with the
    // server-issued PaymentIntent client secret. Requires pk_test_... key and
    // platform setup — see docs/FEATURE_STATUS.md.
    throw UnimplementedError('Stripe Payment Sheet requires configured keys — '
        'see docs/FEATURE_STATUS.md');
  }

  @override
  Widget build(BuildContext context) {
    final plan = widget.plan;
    return Scaffold(
      appBar: AppBar(title: const Text('Check compatibility')),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Text('Before you pay, confirm two things on your phone:',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          _CheckCard(
            title: 'This phone supports eSIM',
            help: 'Most iPhones XS and later and many Android phones do. '
                'On iPhone: Settings → Cellular → Add eSIM. If you see that option, '
                'your phone supports eSIM.',
            confirmed: _esimConfirmed,
            onChanged: (v) => setState(() => _esimConfirmed = v),
          ),
          _CheckCard(
            title: 'This phone is not carrier-locked',
            help: 'A phone locked to one carrier may not accept another eSIM. '
                'Check with the carrier that sold the phone, or on iPhone: '
                'Settings → General → About → Carrier Lock should say "No SIM restrictions".',
            confirmed: _unlockedConfirmed,
            onChanged: (v) => setState(() => _unlockedConfirmed = v),
          ),
          const SizedBox(height: 4),
          Row(children: [
            const SourceChip(Source.customerConfirmed),
            const SizedBox(width: 8),
            Expanded(child: Text(
              'PICO cannot verify these automatically on this device yet — your confirmation is used.',
              style: Theme.of(context).textTheme.bodySmall)),
          ]),
          const Divider(height: 32),
          Text('Order summary', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Card(child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _line(context, plan.name, plan.price),
              _line(context, 'Taxes & fees', '\$0.00'),
              _line(context, 'Total today', plan.price, bold: true),
              const SizedBox(height: 8),
              Text('One-time purchase — no future charges, no subscription.\n'
                  'Activate within ${plan.activationDeadlineDays} days. '
                  'Refundable until the eSIM is installed.',
                  style: Theme.of(context).textTheme.bodySmall),
            ]),
          )),
          if (_error != null) Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(_error!, style: const TextStyle(color: Colors.red))),
          const SizedBox(height: 16),
          if (_result == null)
            FilledButton(
              onPressed: _ready && !_busy ? _createOrder : null,
              child: Text(_busy ? 'Preparing…' : 'Continue to payment'),
            )
          else
            _PaymentSection(result: _result!, busy: _busy, onPay: () async {
              setState(() => _busy = true);
              try { await _pay(); } finally { if (mounted) setState(() => _busy = false); }
            }),
          if (!_ready && _result == null) Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('Confirm both items above to continue.',
                style: Theme.of(context).textTheme.bodySmall),
          ),
        ]),
      ),
    );
  }

  Widget _line(BuildContext context, String label, String value, {bool bold = false}) =>
    Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Expanded(child: Text(label, style: Theme.of(context).textTheme.bodyMedium
            ?.copyWith(fontWeight: bold ? FontWeight.w700 : FontWeight.normal))),
        Text(value, style: Theme.of(context).textTheme.bodyMedium
            ?.copyWith(fontWeight: bold ? FontWeight.w700 : FontWeight.normal)),
      ]),
    );
}

class _CheckCard extends StatelessWidget {
  final String title;
  final String help;
  final bool confirmed;
  final ValueChanged<bool> onChanged;
  const _CheckCard({required this.title, required this.help,
      required this.confirmed, required this.onChanged});

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        Text(help, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 8),
        Row(children: [
          ChoiceChip(label: const Text('Yes, confirmed'), selected: confirmed,
              onSelected: (_) => onChanged(true)),
          const SizedBox(width: 8),
          ChoiceChip(label: const Text('Not sure'), selected: !confirmed,
              onSelected: (_) => onChanged(false)),
        ]),
      ]),
    ),
  );
}

class _PaymentSection extends StatelessWidget {
  final CreateOrderResult result;
  final bool busy;
  final Future<void> Function() onPay;
  const _PaymentSection({required this.result, required this.busy, required this.onPay});

  @override
  Widget build(BuildContext context) {
    final mock = result.payment.mock;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (mock) const MockBanner(
        'TEST payment — no real charge. In production this shows the Stripe '
        'Payment Sheet (Apple Pay / Google Pay where configured).'),
      FilledButton.icon(
        onPressed: busy ? null : onPay,
        icon: Icon(mock ? Icons.science_outlined : Icons.lock_outline),
        label: Text(busy ? 'Processing…'
            : mock ? 'Simulate test payment' : 'Pay securely'),
      ),
    ]);
  }
}

/// Order status — honest staged states (spec §8): payment ≠ installation ≠
/// working internet. Polls until provisioned.
class OrderStatusScreen extends StatefulWidget {
  final ApiClient api;
  final String orderId;
  final VoidCallback onDone;
  const OrderStatusScreen({super.key, required this.api,
      required this.orderId, required this.onDone});

  @override
  State<OrderStatusScreen> createState() => _OrderStatusScreenState();
}

class _OrderStatusScreenState extends State<OrderStatusScreen> {
  late Future<Order> _future;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _future = widget.api.getOrder(widget.orderId);
    _poll = Timer.periodic(const Duration(seconds: 2), (_) async {
      try {
        final o = await widget.api.getOrder(widget.orderId);
        if (mounted && (o.status == 'provisioned' || o.status == 'needs_review')) {
          _poll?.cancel();
          setState(() => _future = Future.value(o));
        }
      } catch (_) {/* transient — keep polling */}
    });
  }

  @override
  void dispose() { _poll?.cancel(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Your order')),
      body: SafeArea(
        child: FutureBuilder<Order>(
          future: _future,
          builder: (context, snap) {
            if (!snap.hasData) return const Center(child: CircularProgressIndicator());
            final o = snap.data!;
            final stage = switch (o.status) {
              'created' || 'payment_failed' => 0,
              'provisioning' => 1,
              'provisioned' => 2,
              _ => 1,
            };
            return ListView(padding: const EdgeInsets.all(16), children: [
              _Stage(label: 'Payment received', done: stage >= 0,
                  note: 'Confirmed by the payment provider (test mode).'),
              _Stage(label: 'Preparing your plan', done: stage >= 1,
                  note: 'The supplier is issuing your eSIM.'),
              _Stage(label: 'Ready to install', done: stage >= 2,
                  note: o.esim != null
                      ? 'eSIM issued — ICCID ${o.esim!['iccid']}'
                      : 'Waiting for the supplier…'),
              const SizedBox(height: 12),
              if (o.status == 'provisioned') ...[
                const Card(child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Icon(Icons.qr_code_2, size: 28, color: PicoColors.blue),
                      SizedBox(width: 8),
                      Expanded(child: Text('Install your eSIM', style:
                        TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
                    ]),
                    SizedBox(height: 8),
                    Text('TEST MODE: a real activation code (SM-DP+) is stored '
                        'server-side but not shown here yet. In the full app you will '
                        'see a QR code plus manual entry steps with illustrations, '
                        'and installation guidance for when the QR is on this same phone.'),
                  ]),
                )),
                const SizedBox(height: 8),
                FilledButton(onPressed: widget.onDone,
                    child: const Text('View in My Plans')),
              ],
              if (o.status == 'needs_review')
                const Card(child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('We could not confirm your eSIM with the supplier yet. '
                      'Nothing extra was charged — we will retry and you can reach '
                      'support from Help if this does not resolve shortly.'),
                )),
            ]);
          },
        ),
      ),
    );
  }
}

class _Stage extends StatelessWidget {
  final String label;
  final bool done;
  final String note;
  const _Stage({required this.label, required this.done, required this.note});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 10),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Icon(done ? Icons.check_circle : Icons.radio_button_unchecked,
          color: done ? PicoColors.green : PicoColors.subtle, size: 28),
      const SizedBox(width: 12),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: Theme.of(context).textTheme.titleMedium),
        Text(note, style: Theme.of(context).textTheme.bodySmall),
      ])),
    ]),
  );
}
