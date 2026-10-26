import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../order_store.dart';
import '../theme.dart';
import 'checkout.dart';
import 'help.dart' show kSupportEmail;

/// My Plans (spec §9, §19.C): adapts to actual purchases, shows ONE prominent
/// next action, and states honestly when allowance/status is unavailable.
class MyPlansTab extends StatefulWidget {
  final ApiClient api;
  final OrderStore store;
  const MyPlansTab({super.key, required this.api, required this.store});

  @override
  State<MyPlansTab> createState() => MyPlansTabState();
}

class MyPlansTabState extends State<MyPlansTab> {
  late Future<List<Order>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  void reload() => setState(() { _future = _load(); });

  Future<List<Order>> _load() async {
    final ids = await widget.store.orderIds();
    final out = <Order>[];
    for (final id in ids) {
      try { out.add(await widget.api.getOrder(id)); } catch (_) {/* gone or offline — skip */}
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Plans')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: FutureBuilder<List<Order>>(
            future: _future,
            builder: (context, snap) {
              if (!snap.hasData) return const Center(child: CircularProgressIndicator());
              final orders = snap.data!;
              if (orders.isEmpty) {
                return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Image.asset('assets/PICO_CHARACTER.png', height: 140),
                  const SizedBox(height: 16),
                  Text('No plans yet', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 6),
                  Text('Pick a destination in Travel to see plans for your trip.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium),
                  const SizedBox(height: 12),
                  Text('After your first plan is paid, you get a code to share:\n'
                      'friends save \$5, you earn \$5 credit.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall),
                ]));
              }
              final paid = orders.where((o) =>
                  ['provisioning', 'provisioned', 'needs_review'].contains(o.status));
              return ListView(children: [
                const SizedBox(height: 8),
                if (paid.isNotEmpty)
                  _ReferralCard(api: widget.api, order: paid.first),
                for (final o in orders) _OrderCard(api: widget.api, order: o, onChanged: reload),
              ]);
            },
          ),
        ),
      ),
    );
  }
}

/// "Give $5 — Get $5": the customer's code + earned credit. Credit is a real
/// server ledger balance; in test mode the money movement is simulated.
class _ReferralCard extends StatelessWidget {
  final ApiClient api;
  final Order order;
  const _ReferralCard({required this.api, required this.order});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: PicoColors.navy,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: FutureBuilder<ReferralInfo>(
          future: api.getReferral(order.id),
          builder: (context, snap) {
            final info = snap.data;
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Give \$5 — Get \$5',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16)),
              const SizedBox(height: 6),
              const Text('Friends get \$5 off their first eligible plan. '
                  'You earn \$5 PICO credit when their payment clears.',
                  style: TextStyle(color: Colors.white70, fontSize: 13)),
              const SizedBox(height: 12),
              if (info == null)
                const SizedBox(height: 20,
                    child: Center(child: CircularProgressIndicator(strokeWidth: 2)))
              else if (info.code == null)
                const Text('Your code appears once your first plan is paid.',
                    style: TextStyle(color: Colors.white70, fontSize: 13))
              else
                Row(children: [
                  Expanded(child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 14),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(info.code!,
                        style: const TextStyle(color: Colors.white,
                            fontWeight: FontWeight.w700, fontSize: 18, letterSpacing: 1.5)),
                  )),
                  const SizedBox(width: 8),
                  FilledButton.tonalIcon(
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                    icon: const Icon(Icons.copy, size: 16),
                    label: const Text('Copy'),
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: info.code!));
                      ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Code copied — send it to a friend.')));
                    },
                  ),
                ]),
              if (info != null && info.code != null) ...[
                const SizedBox(height: 10),
                Text(
                  'Credit balance: \$${(info.creditCents / 100).toStringAsFixed(2)}'
                  '${info.redemptionCount > 0 ? ' (${info.redemptionCount} friend${info.redemptionCount == 1 ? '' : 's'} joined)' : ''}'
                  ' — applies to future PICO purchases.',
                  style: const TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 4),
                const Text('TEST MODE: credit is tracked on the server; money movement is simulated.',
                    style: TextStyle(color: Colors.white54, fontSize: 11)),
              ],
            ]);
          },
        ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  final ApiClient api;
  final Order order;
  final VoidCallback onChanged;
  const _OrderCard({required this.api, required this.order, required this.onChanged});

  String get _headline => switch (order.status) {
    'created' => 'Continue setup — payment not finished',
    'payment_failed' => 'Payment failed — try again',
    'provisioning' => 'Preparing your plan',
    'provisioned' => 'Ready to install',
    'needs_review' => 'Checking with supplier',
    'refunded' => 'Refunded',
    'canceled' => 'Canceled',
    _ => order.status,
  };

  @override
  Widget build(BuildContext context) {
    final esim = order.esim;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(order.planName ?? 'Trip plan',
                style: Theme.of(context).textTheme.titleMedium)),
            if (esim?['is_mock'] == 1)
              const Chip(label: Text('TEST', style: TextStyle(fontSize: 11)),
                  backgroundColor: Color(0x1FB7791F)),
          ]),
          Text(order.destination, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 8),
          // ONE prominent next action (spec §19.C) — opens live order status.
          InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () => Navigator.push(context, MaterialPageRoute(
              builder: (_) => OrderStatusScreen(api: api, orderId: order.id,
                  onDone: onChanged))),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: PicoColors.blue.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(children: [
                Expanded(child: Text(_headline,
                    style: const TextStyle(color: PicoColors.blue, fontWeight: FontWeight.w700))),
                const Icon(Icons.chevron_right, color: PicoColors.blue),
              ]),
            ),
          ),
          const SizedBox(height: 10),
          // Honest availability (spec §9): usage data needs the supplier usage
          // API (Sprint 3) — say so rather than fabricate a balance.
          const Row(children: [
            Icon(Icons.info_outline, size: 16, color: PicoColors.subtle),
            SizedBox(width: 6),
            Expanded(child: Text('Remaining allowance: not available yet — '
                'usage reporting arrives with the supplier integration.',
                style: TextStyle(color: PicoColors.subtle, fontSize: 13))),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            TextButton.icon(
              onPressed: () => _rename(context),
              icon: const Icon(Icons.edit_outlined, size: 18),
              label: const Text('Rename'),
            ),
            if (order.status == 'provisioned')
              TextButton.icon(
                onPressed: () => launchUrl(Uri(scheme: 'mailto', path: kSupportEmail,
                    query: 'subject=${Uri.encodeComponent('Refund request: order ${order.id}')}'),
                    mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.undo, size: 18),
                label: const Text('Request refund'),
              ),
            const Spacer(),
            Text('Order ${order.id.substring(0, order.id.length < 8 ? order.id.length : 8)}',
                style: Theme.of(context).textTheme.bodySmall),
          ]),
        ]),
      ),
    );
  }

  Future<void> _rename(BuildContext context) async {
    final ctrl = TextEditingController(text: order.planName ?? '');
    final name = await showDialog<String>(context: context, builder: (ctx) => AlertDialog(
      title: const Text('Name this plan'),
      content: TextField(controller: ctrl, autofocus: true,
          decoration: const InputDecoration(hintText: 'e.g. France Trip, Business')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('Save')),
      ],
    ));
    if (name != null && name.isNotEmpty) {
      await api.renameOrder(order.id, name);
      onChanged();
    }
  }
}
