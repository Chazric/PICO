import 'package:flutter/material.dart';
import '../api.dart';
import '../order_store.dart';
import '../theme.dart';
import 'plan_detail.dart';

/// Travel tab (spec §5): starts with "Where are you going?", browsable without
/// signing in. Destination selection never implies a phone number (spec §3).
class TravelTab extends StatefulWidget {
  final ApiClient api;
  final OrderStore store;
  final VoidCallback onPurchased;
  const TravelTab({super.key, required this.api, required this.store, required this.onPurchased});

  @override
  State<TravelTab> createState() => _TravelTabState();
}

class _TravelTabState extends State<TravelTab> {
  String _query = '';
  late Future<List<Destination>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.destinations();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Where are you going?'),
        actions: [IconButton(icon: const Icon(Icons.account_circle_outlined), onPressed: () {})],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(children: [
            TextField(
              decoration: InputDecoration(
                hintText: 'Search destinations',
                prefixIcon: const Icon(Icons.search),
                filled: true, fillColor: PicoColors.card,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              ),
              onChanged: (v) => setState(() => _query = v.toLowerCase()),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: FutureBuilder<List<Destination>>(
                future: _future,
                builder: (context, snap) {
                  if (snap.hasError) return const _LoadError();
                  if (!snap.hasData) return const Center(child: CircularProgressIndicator());
                  final dests = snap.data!
                      .where((d) => d.name.toLowerCase().contains(_query)).toList();
                  if (dests.isEmpty) {
                    return const Center(child: Text('No destinations match your search.'));
                  }
                  return ListView(children: [
                    const MockBanner('Test catalog — plans shown are simulated, not purchasable.'),
                    for (final d in dests)
                      Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                          title: Text(d.name, style: Theme.of(context).textTheme.titleMedium),
                          subtitle: Text(d.kind == 'region'
                              ? 'Covers ${d.coveredCountries.length}+ countries'
                              : 'Data plans for ${d.name}'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => Navigator.push(context, MaterialPageRoute(
                            builder: (_) => PlansScreen(
                              api: widget.api, store: widget.store,
                              destination: d, onPurchased: widget.onPurchased))),
                        ),
                      ),
                    const SizedBox(height: 8),
                    Text('Plans shown are data-only unless stated. Selecting a destination '
                        'does not include a phone number.',
                        style: Theme.of(context).textTheme.bodySmall),
                  ]);
                },
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class PlansScreen extends StatelessWidget {
  final ApiClient api;
  final OrderStore store;
  final Destination destination;
  final VoidCallback onPurchased;
  const PlansScreen({super.key, required this.api, required this.store,
      required this.destination, required this.onPurchased});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(destination.name)),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: FutureBuilder<List<Plan>>(
            future: api.plans(destination.code),
            builder: (context, snap) {
              if (snap.hasError) return const _LoadError();
              if (!snap.hasData) return const Center(child: CircularProgressIndicator());
              final plans = snap.data!;
              // Spec §5: "What do you need?" — Internet vs Internet + calls/texts.
              // Mock catalog is data-only; say so rather than imply voice exists.
              return ListView(children: [
                Text('What do you need?', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 6),
                Text('These plans provide Internet (data) only. Calls and texts use '
                    'your regular SIM or internet apps — no local phone number is included.',
                    style: Theme.of(context).textTheme.bodyMedium),
                const SizedBox(height: 12),
                for (final p in plans) _PlanCard(plan: p, onTap: () =>
                  Navigator.push(context, MaterialPageRoute(
                    builder: (_) => PlanDetailScreen(
                      api: api, store: store, plan: p,
                      destinationName: destination.name, onPurchased: onPurchased)))),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.list),
                  label: const Text('View all plans'),
                ),
              ]);
            },
          ),
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  final Plan plan;
  final VoidCallback onTap;
  const _PlanCard({required this.plan, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final tierLabel = { 'light': 'Light Use', 'everyday': 'Everyday Use', 'heavy': 'Heavy Use' }[plan.tier]!;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text(tierLabel, style: Theme.of(context).textTheme.titleMedium),
              Text(plan.price, style: Theme.of(context).textTheme.titleLarge),
            ]),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              _Fact(Icons.data_usage, plan.dataAllowance),
              _Fact(Icons.schedule, '${plan.validityDays} days'),
              _Fact(Icons.public, plan.sharedAcrossCountries ? 'Shared across countries' : plan.destination),
            ]),
            const SizedBox(height: 6),
            Text('Data only — no calls, texts, or phone number.',
                style: Theme.of(context).textTheme.bodySmall),
          ]),
        ),
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  final IconData icon; final String text;
  const _Fact(this.icon, this.text);
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
    Icon(icon, size: 16, color: PicoColors.subtle),
    const SizedBox(width: 4),
    Text(text, style: Theme.of(context).textTheme.bodySmall),
  ]);
}

class _LoadError extends StatelessWidget {
  const _LoadError();
  @override
  Widget build(BuildContext context) => Center(
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.cloud_off, size: 40, color: PicoColors.subtle),
      const SizedBox(height: 12),
      Text('Could not reach the PICO service. Check your connection and try again.',
          textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium),
    ]),
  );
}
