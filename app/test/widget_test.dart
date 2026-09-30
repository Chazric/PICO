import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pico_app/api.dart';
import 'package:pico_app/main.dart';
import 'package:pico_app/order_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _json(Map<String, dynamic> body, [int status = 200]) =>
    http.Response.bytes(utf8.encode(jsonEncode(body)), status,
        headers: {'content-type': 'application/json'});

/// Fake backend serving the mock catalog/order endpoints the app uses.
ApiClient fakeApi() {
  final client = MockClient((req) async {
    final path = req.url.path;
    if (path == '/api/v1/catalog/destinations') {
      return _json({
        'supplier': 'mock',
        'destinations': [
          {'code': 'FR', 'name': 'France', 'kind': 'country'},
          {'code': 'JP', 'name': 'Japan', 'kind': 'country'},
        ],
      });
    }
    if (path == '/api/v1/catalog/plans') {
      return _json({'supplier': 'mock',
        'plans': [_planJson('mock-fr-everyday', 'Everyday Use — 10 GB / 15 days', 1499)]});
    }
    if (path == '/api/v1/orders' && req.method == 'POST') {
      return _json({
        'order': _orderJson('ord-1', 'created'),
        'payment': {'paymentIntentId': 'pi_mock_1', 'clientSecret': 'sec', 'mock': true, 'publishableKey': null},
        'orderSummary': {'totalCents': 1499, 'taxCents': 0, 'currency': 'USD',
            'futureCharges': 'none — one-time purchase', 'renewal': '', 'activationDeadlineDays': 180,
            'cancellation': '', 'products': []},
      }, 201);
    }
    if (path.startsWith('/api/v1/orders/')) {
      return _json({'order': _orderJson('ord-1', 'provisioned')});
    }
    if (path == '/api/v1/health') {
      return _json({'ok': true, 'billingMode': 'mock', 'supplier': 'mock'});
    }
    if (path == '/api/v1/dev/confirm-payment') {
      return _json({'delivered': true});
    }
    return http.Response('{}', 404);
  });
  return ApiClient(client: client);
}

Map<String, dynamic> _planJson(String id, String name, int cents) => {
  'planId': id, 'name': name, 'tier': 'everyday', 'destination': 'FR',
  'coveredDestinations': ['FR'], 'dataAllowance': '10 GB', 'dataBytes': 10000000000,
  'validityDays': 15, 'validityStarts': 'on first connection',
  'activationDeadlineDays': 180,
  'calls': {'included': false, 'detail': 'Data only — no calls or SMS on this plan.'},
  'sms': {'included': false, 'detail': 'Data only.'},
  'phoneNumber': {'available': false, 'detail': 'No local phone number is included.'},
  'hotspot': 'Allowed', 'speedPolicy': 'Full speed', 'fairUse': 'None',
  'renewal': {'renewable': false, 'detail': 'One-time purchase'},
  'sharedAcrossCountries': false, 'priceCents': cents, 'currency': 'USD',
};

Map<String, dynamic> _orderJson(String id, String status) => {
  'id': id, 'plan_id': 'mock-fr-everyday', 'destination': 'FR',
  'amount_cents': 1499, 'currency': 'USD', 'status': status,
  'plan_name': 'France Trip', 'esim': null, 'provisioning': null,
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('three tabs: Travel, My Plans, Help', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(PicoApp(api: fakeApi(), store: OrderStore()));
    await tester.pumpAndSettle();
    expect(find.text('Travel'), findsOneWidget);
    expect(find.text('My Plans'), findsOneWidget);
    expect(find.text('Help'), findsOneWidget);
    expect(find.text('Where are you going?'), findsOneWidget);
  });

  testWidgets('Travel: destination list and plans flow', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(PicoApp(api: fakeApi(), store: OrderStore()));
    await tester.pumpAndSettle();
    expect(find.text('France'), findsOneWidget);

    await tester.tap(find.text('France'));
    await tester.pumpAndSettle();
    expect(find.text('What do you need?'), findsOneWidget);
    // Data-only disclosure is shown — no implied phone number (spec §3).
    expect(find.textContaining('no local phone number'), findsWidgets);
    expect(find.text('Everyday Use'), findsOneWidget);

    await tester.tap(find.text('Everyday Use'));
    await tester.pumpAndSettle();
    expect(find.text('Data allowance'), findsOneWidget);
    expect(find.textContaining('\$14.99'), findsWidgets);
    expect(find.textContaining('TEST PLAN'), findsOneWidget);
  });

  testWidgets('My Plans: shows purchased order with honest allowance note', (tester) async {
    SharedPreferences.setMockInitialValues({'pico_order_ids': ['ord-1']});
    await tester.pumpWidget(PicoApp(api: fakeApi(), store: OrderStore()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('My Plans'));
    await tester.pumpAndSettle();
    expect(find.text('France Trip'), findsOneWidget);
    expect(find.textContaining('not available yet'), findsOneWidget);
  });

  testWidgets('Help: I can\'t connect flow is reachable', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(PicoApp(api: fakeApi(), store: OrderStore()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Help'));
    await tester.pumpAndSettle();
    await tester.tap(find.text("I can't connect"));
    await tester.pumpAndSettle();
    expect(find.textContaining('Is your plan installed?'), findsOneWidget);
  });
}
