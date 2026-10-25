import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../theme.dart';

/// Help tab (spec §10, §19.E): visible "I can't connect" flow with guided
/// checks; detection limits are stated, never faked. Optional diagnostics are
/// customer-triggered only.
const kSupportEmail = 'redreishilife+pico@gmail.com';

/// Hosted Privacy Policy / Terms / Support pages. Override with --dart-define=LEGAL_BASE=...
const kLegalBase = String.fromEnvironment('LEGAL_BASE',
    defaultValue: 'https://pico-legal.onrender.com');

Future<void> _open(BuildContext context, Uri uri) async {
  final messenger = ScaffoldMessenger.of(context);
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!ok) {
    messenger.showSnackBar(SnackBar(content: Text(uri.scheme == 'mailto'
        ? 'No email app found. Write to $kSupportEmail'
        : 'Could not open ${uri.toString()}')));
  }
}

class HelpTab extends StatelessWidget {
  final ApiClient api;
  const HelpTab({super.key, required this.api});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Help')),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Card(
            color: PicoColors.blue.withValues(alpha: 0.06),
            child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              leading: const Icon(Icons.wifi_off, size: 32, color: PicoColors.blue),
              title: Text("I can't connect", style: Theme.of(context).textTheme.titleMedium),
              subtitle: const Text('Step-by-step checks to get online'),
              onTap: () => Navigator.push(context, MaterialPageRoute(
                  builder: (_) => const CantConnectScreen())),
            ),
          ),
          Card(child: ListTile(
            leading: const Icon(Icons.speed, size: 28, color: PicoColors.blue),
            title: const Text('Check my connection'),
            subtitle: const Text('A small reachability test — uses very little data'),
            onTap: () => Navigator.push(context, MaterialPageRoute(
                builder: (_) => ConnectionCheckScreen(api: api))),
          )),
          Card(child: ListTile(
            leading: const Icon(Icons.support_agent, size: 28, color: PicoColors.blue),
            title: const Text('Contact support'),
            subtitle: const Text('Email $kSupportEmail — replies within 1 business day'),
            onTap: () => _open(context, Uri(scheme: 'mailto', path: kSupportEmail,
                query: 'subject=PICO%20support')),
          )),
          const SizedBox(height: 8),
          Text('Help & legal', style: Theme.of(context).textTheme.titleMedium),
          for (final link in const [
            ('Support & FAQ', 'support.html', Icons.menu_book_outlined),
            ('Privacy Policy', 'privacy.html', Icons.privacy_tip_outlined),
            ('Terms of Service', 'terms.html', Icons.description_outlined),
          ])
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(link.$3, color: PicoColors.blue),
              title: Text(link.$1),
              trailing: const Icon(Icons.open_in_new, size: 18),
              onTap: () => _open(context, Uri.parse('$kLegalBase/${link.$2}')),
            ),
          const SizedBox(height: 8),
          Text('Support hours: we are a small team and reply within one business day. '
              'Diagnostic details are only shared with your permission and never '
              'include payment info or activation codes.',
              style: Theme.of(context).textTheme.bodySmall),
        ]),
      ),
    );
  }
}

class CantConnectScreen extends StatelessWidget {
  const CantConnectScreen({super.key});

  static const _steps = [
    ('Is your plan installed?', 'Check Settings → Cellular (iPhone) or '
        'Settings → SIM cards (Android). Your PICO eSIM should be listed.'),
    ('Is the PICO line selected for data?', 'Choose the PICO eSIM as your '
        'mobile-data line in Settings.'),
    ('Is data roaming ON for the PICO line?', 'Travel eSIMs need roaming '
        'enabled on that line only. Your home SIM can stay as-is.'),
    ('Turn airplane mode off, then on, then off again.',
        'This forces a fresh network registration.'),
    ('Still nothing? Coverage or a supplier issue may be the cause.',
        'Check your destination is covered and try the connection check below.'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("I can't connect")),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('Work through these in order — most connection issues are one of the first three.',
            style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 12),
        for (var i = 0; i < _steps.length; i++)
          Card(child: ListTile(
            leading: CircleAvatar(backgroundColor: PicoColors.blue,
                child: Text('${i + 1}', style: const TextStyle(color: Colors.white))),
            title: Text(_steps[i].$1, style: Theme.of(context).textTheme.titleMedium),
            subtitle: Text(_steps[i].$2),
          )),
        const SizedBox(height: 8),
        Text('PICO cannot read these settings automatically on every phone — '
            'where a check is marked "confirmed by you", we rely on what you see.',
            style: Theme.of(context).textTheme.bodySmall),
      ]),
    );
  }
}

/// Customer-triggered diagnostics (spec §19.E): starts small, explains limits,
/// and asks consent with an estimate before any larger test.
class ConnectionCheckScreen extends StatefulWidget {
  final ApiClient api;
  const ConnectionCheckScreen({super.key, required this.api});

  @override
  State<ConnectionCheckScreen> createState() => _ConnectionCheckScreenState();
}

class _ConnectionCheckScreenState extends State<ConnectionCheckScreen> {
  String _result = '';
  bool _running = false;

  Future<void> _check() async {
    setState(() { _running = true; _result = ''; });
    final sw = Stopwatch()..start();
    try {
      await widget.api.health();
      sw.stop();
      setState(() => _result =
          'Internet is reachable (about ${sw.elapsedMilliseconds} ms). '
          'This proves SOME connection works — it does not prove the PICO eSIM '
          'is carrying it. Wi-Fi could be providing this connection.');
    } catch (_) {
      setState(() => _result =
          'No internet connection detected right now. Try the steps in '
          '"I can\'t connect" or check Wi-Fi.');
    } finally {
      setState(() => _running = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Check my connection')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('This sends a tiny request (a few KB) to check reachability and latency.',
            style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 6),
        Text('A full speed test can use hundreds of MB and is only run if you ask for it.',
            style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _running ? null : _check,
          child: Text(_running ? 'Checking…' : 'Run small check'),
        ),
        if (_result.isNotEmpty) Padding(
          padding: const EdgeInsets.only(top: 16),
          child: Card(child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(_result, style: Theme.of(context).textTheme.bodyMedium),
          )),
        ),
      ]),
    );
  }
}
