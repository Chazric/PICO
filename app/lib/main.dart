import 'package:flutter/material.dart';
import 'api.dart';
import 'order_store.dart';
import 'theme.dart';
import 'screens/travel.dart';
import 'screens/my_plans.dart';
import 'screens/help.dart';

void main() => runApp(PicoApp(api: ApiClient(), store: OrderStore()));

/// Exactly three primary tabs: Travel, My Plans, Help (spec §4).
class PicoApp extends StatelessWidget {
  final ApiClient api;
  final OrderStore store;
  const PicoApp({super.key, required this.api, required this.store});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PICO',
      theme: picoTheme(),
      debugShowCheckedModeBanner: false,
      home: HomeShell(api: api, store: store),
    );
  }
}

class HomeShell extends StatefulWidget {
  final ApiClient api;
  final OrderStore store;
  const HomeShell({super.key, required this.api, required this.store});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;
  final _plansKey = GlobalKey<MyPlansTabState>();

  void goToMyPlans() {
    setState(() => _tab = 1);
    _plansKey.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          TravelTab(api: widget.api, store: widget.store, onPurchased: goToMyPlans),
          MyPlansTab(key: _plansKey, api: widget.api, store: widget.store),
          HelpTab(api: widget.api),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) {
          setState(() => _tab = i);
          if (i == 1) _plansKey.currentState?.reload();
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.travel_explore), label: 'Travel'),
          NavigationDestination(icon: Icon(Icons.sim_card_outlined), label: 'My Plans'),
          NavigationDestination(icon: Icon(Icons.help_outline), label: 'Help'),
        ],
      ),
    );
  }
}
