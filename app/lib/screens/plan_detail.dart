import 'package:flutter/material.dart';
import '../api.dart';
import '../order_store.dart';
import '../theme.dart';
import 'checkout.dart';

/// Full plan disclosure (spec §5) followed by compatibility guidance (§6)
/// before payment. Nothing here is advertised beyond what the catalog reports.
class PlanDetailScreen extends StatelessWidget {
  final ApiClient api;
  final OrderStore store;
  final Plan plan;
  final String destinationName;
  final VoidCallback onPurchased;
  const PlanDetailScreen({super.key, required this.api, required this.store,
      required this.plan, required this.destinationName, required this.onPurchased});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(destinationName)),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Text(plan.name, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(plan.price, style: Theme.of(context).textTheme.headlineSmall
              ?.copyWith(color: PicoColors.blue, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Row(children: [
            const SourceChip(Source.supplierReported),
            if (plan.isMock) ...[
              const SizedBox(width: 8),
              const Chip(label: Text('TEST PLAN', style: TextStyle(fontSize: 11)),
                  backgroundColor: Color(0x1FB7791F)),
            ],
          ]),
          const SizedBox(height: 16),
          _row(context, 'Price', '${plan.price} — one-time purchase'),
          _row(context, 'Data allowance', plan.dataAllowance),
          _row(context, 'Validity', '${plan.validityDays} days — starts ${plan.validityStarts}'),
          _row(context, 'Coverage', plan.sharedAcrossCountries
              ? 'Shared allowance across ${plan.coveredDestinations.length} destinations'
              : 'Works in ${plan.coveredDestinations.join(', ')}'),
          _row(context, 'Activate by', 'Within ${plan.activationDeadlineDays} days of purchase'),
          _row(context, 'Calls', plan.calls['detail'] as String),
          _row(context, 'Texts (SMS)', plan.sms['detail'] as String),
          _row(context, 'Phone number', plan.phoneNumber['detail'] as String),
          _row(context, 'Hotspot', plan.hotspot),
          _row(context, 'Speed', plan.speedPolicy),
          _row(context, 'Fair use', plan.fairUse),
          _row(context, 'Renewal', plan.renewal['detail'] as String),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => Navigator.push(context, MaterialPageRoute(
              builder: (_) => CheckoutScreen(
                api: api, store: store, plan: plan, onPurchased: onPurchased))),
            child: const Text('Continue'),
          ),
        ]),
      ),
    );
  }

  Widget _row(BuildContext context, String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SizedBox(width: 130, child: Text(label,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600))),
      Expanded(child: Text(value, style: Theme.of(context).textTheme.bodyMedium)),
    ]),
  );
}
