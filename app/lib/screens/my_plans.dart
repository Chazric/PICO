import 'package:flutter/material.dart';
import '../api.dart';
import '../order_store.dart';
import '../theme.dart';

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
                ]));
              }
              return ListView(children: [
                const SizedBox(height: 8),
                for (final o in orders) _OrderCard(api: widget.api, order: o, onChanged: reload),
              ]);
            },
          ),
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
          // ONE prominent next action (spec §19.C).
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: PicoColors.blue.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(_headline,
                style: const TextStyle(color: PicoColors.blue, fontWeight: FontWeight.w700)),
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
