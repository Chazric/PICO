import 'package:shared_preferences/shared_preferences.dart';

/// Persists purchased order ids locally so My Plans survives restarts.
/// Only non-sensitive ids are stored (spec §9: credentials use secure storage).
class OrderStore {
  static const _key = 'pico_order_ids';

  Future<List<String>> orderIds() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getStringList(_key) ?? [];
  }

  Future<void> add(String orderId) async {
    final prefs = await SharedPreferences.getInstance();
    final ids = prefs.getStringList(_key) ?? [];
    if (!ids.contains(orderId)) {
      ids.insert(0, orderId);
      await prefs.setStringList(_key, ids);
    }
  }
}
