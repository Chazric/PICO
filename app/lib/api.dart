import 'dart:convert';
import 'package:http/http.dart' as http;

/// API base URL. Override with --dart-define=API_BASE=http://host:port
const kApiBase = String.fromEnvironment('API_BASE', defaultValue: 'http://localhost:4242');

class Destination {
  final String code;
  final String name;
  final String kind;
  final List<String> coveredCountries;
  Destination.fromJson(Map<String, dynamic> j)
      : code = j['code'],
        name = j['name'],
        kind = j['kind'],
        coveredCountries = (j['coveredCountries'] as List?)?.cast<String>() ?? const [];
}

class Plan {
  final String planId;
  final String name;
  final String tier;
  final String destination;
  final List<String> coveredDestinations;
  final String dataAllowance;
  final int validityDays;
  final String validityStarts;
  final int activationDeadlineDays;
  final Map<String, dynamic> calls;
  final Map<String, dynamic> sms;
  final Map<String, dynamic> phoneNumber;
  final String hotspot;
  final String speedPolicy;
  final String fairUse;
  final Map<String, dynamic> renewal;
  final bool sharedAcrossCountries;
  final int priceCents;
  final String currency;
  final String supplier;

  Plan.fromJson(Map<String, dynamic> j, {this.supplier = 'mock'})
      : planId = j['planId'],
        name = j['name'],
        tier = j['tier'],
        destination = j['destination'],
        coveredDestinations = (j['coveredDestinations'] as List).cast<String>(),
        dataAllowance = j['dataAllowance'],
        validityDays = j['validityDays'],
        validityStarts = j['validityStarts'],
        activationDeadlineDays = j['activationDeadlineDays'],
        calls = j['calls'],
        sms = j['sms'],
        phoneNumber = j['phoneNumber'],
        hotspot = j['hotspot'],
        speedPolicy = j['speedPolicy'],
        fairUse = j['fairUse'],
        renewal = j['renewal'],
        sharedAcrossCountries = j['sharedAcrossCountries'],
        priceCents = j['priceCents'],
        currency = j['currency'];

  String get price => '\$${(priceCents / 100).toStringAsFixed(2)} $currency';
  bool get isMock => supplier == 'mock';
}

class PaymentInfo {
  final String paymentIntentId;
  final String clientSecret;
  final bool mock;
  final String? publishableKey;
  PaymentInfo.fromJson(Map<String, dynamic> j)
      : paymentIntentId = j['paymentIntentId'],
        clientSecret = j['clientSecret'],
        mock = j['mock'] == true,
        publishableKey = j['publishableKey'];
}

class Order {
  final String id;
  final String planId;
  final String destination;
  final int amountCents;
  final String currency;
  final String status;
  final String? planName;
  final Map<String, dynamic>? esim;
  final Map<String, dynamic>? provisioning;
  Order.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        planId = j['plan_id'],
        destination = j['destination'],
        amountCents = j['amount_cents'],
        currency = j['currency'],
        status = j['status'],
        planName = j['plan_name'],
        esim = j['esim'] as Map<String, dynamic>?,
        provisioning = j['provisioning'] as Map<String, dynamic>?;
}

class CreateOrderResult {
  final Order order;
  final PaymentInfo payment;
  final Map<String, dynamic> orderSummary;
  CreateOrderResult.fromJson(Map<String, dynamic> j)
      : order = Order.fromJson(j['order']),
        payment = PaymentInfo.fromJson(j['payment']),
        orderSummary = j['orderSummary'];
}

class ApiClient {
  final http.Client _http;
  final String base;
  ApiClient({http.Client? client, this.base = kApiBase}) : _http = client ?? http.Client();

  Future<Map<String, dynamic>> health() async =>
      jsonDecode((await _http.get(Uri.parse('$base/api/v1/health'))).body);

  Future<List<Destination>> destinations() async {
    final r = await _http.get(Uri.parse('$base/api/v1/catalog/destinations'));
    return (jsonDecode(r.body)['destinations'] as List)
        .map((d) => Destination.fromJson(d)).toList();
  }

  Future<List<Plan>> plans(String destination) async {
    final r = await _http.get(Uri.parse('$base/api/v1/catalog/plans?destination=$destination'));
    final body = jsonDecode(r.body);
    return (body['plans'] as List)
        .map((p) => Plan.fromJson(p, supplier: body['supplier'] ?? 'mock')).toList();
  }

  Future<CreateOrderResult> createOrder({
    required String planId,
    required String destination,
    String? planName,
    String? idempotencyKey,
  }) async {
    final r = await _http.post(
      Uri.parse('$base/api/v1/orders'),
      headers: {
        'content-type': 'application/json',
        if (idempotencyKey != null) 'idempotency-key': idempotencyKey,
      },
      body: jsonEncode({'planId': planId, 'destination': destination, 'planName': planName}),
    );
    if (r.statusCode != 201 && r.statusCode != 200) {
      throw Exception('order failed: ${r.body}');
    }
    return CreateOrderResult.fromJson(jsonDecode(r.body));
  }

  Future<Order> getOrder(String id) async =>
      Order.fromJson(jsonDecode((await _http.get(Uri.parse('$base/api/v1/orders/$id'))).body)['order']);

  Future<void> renameOrder(String id, String name) async {
    await _http.post(Uri.parse('$base/api/v1/orders/$id/name'),
        headers: {'content-type': 'application/json'}, body: jsonEncode({'planName': name}));
  }

  /// Dev/test only — drives a signed payment event through the backend's real
  /// verify -> durable -> fulfill pipeline. Exists only outside production;
  /// in production Stripe itself delivers the webhook.
  Future<void> confirmPayment(String orderId, {String outcome = 'succeeded'}) async {
    final r = await _http.post(Uri.parse('$base/api/v1/dev/confirm-payment'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode({'orderId': orderId, 'outcome': outcome}));
    if (r.statusCode != 200) throw Exception('confirm failed: ${r.body}');
  }
}
