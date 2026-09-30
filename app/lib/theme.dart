import 'package:flutter/material.dart';

/// PICO brand (spec §2): white backgrounds, deep navy text, blue primary,
/// green success accents. Navy icon does not imply a dark UI.
class PicoColors {
  static const navy = Color(0xFF0B1B3F);
  static const blue = Color(0xFF1D5FD6);
  static const green = Color(0xFF159A4C);
  static const amber = Color(0xFFB7791F);
  static const surface = Colors.white;
  static const card = Color(0xFFF4F6FB);
  static const subtle = Color(0xFF5A6B8C);
}

ThemeData picoTheme() {
  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: PicoColors.blue,
      primary: PicoColors.blue,
      surface: PicoColors.surface,
    ),
    scaffoldBackgroundColor: PicoColors.surface,
    appBarTheme: const AppBarTheme(
      backgroundColor: PicoColors.surface,
      foregroundColor: PicoColors.navy,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: PicoColors.navy, fontSize: 22, fontWeight: FontWeight.w700,
      ),
    ),
    textTheme: const TextTheme(
      bodyLarge: TextStyle(color: PicoColors.navy, fontSize: 17, height: 1.45),
      bodyMedium: TextStyle(color: PicoColors.navy, fontSize: 15, height: 1.45),
      titleLarge: TextStyle(color: PicoColors.navy, fontSize: 20, fontWeight: FontWeight.w700),
      titleMedium: TextStyle(color: PicoColors.navy, fontSize: 17, fontWeight: FontWeight.w600),
    ),
    cardTheme: CardThemeData(
      color: PicoColors.card,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      margin: const EdgeInsets.symmetric(vertical: 6),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: PicoColors.blue,
        minimumSize: const Size.fromHeight(56),
        textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      labelTextStyle: WidgetStateProperty.all(
        const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
  );
}

/// Information provenance chip (spec §6, §19.B): every diagnostic/plan fact is
/// labeled by where it came from — never fabricated.
enum Source { deviceVerified, supplierReported, customerConfirmed, unknown }

class SourceChip extends StatelessWidget {
  final Source source;
  const SourceChip(this.source, {super.key});

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (source) {
      Source.deviceVerified => ('Verified by your device', PicoColors.green),
      Source.supplierReported => ('Reported by supplier', PicoColors.blue),
      Source.customerConfirmed => ('Confirmed by you', PicoColors.blue),
      Source.unknown => ('Not yet checked', PicoColors.amber),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

class MockBanner extends StatelessWidget {
  final String text;
  const MockBanner(this.text, {super.key});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: PicoColors.amber.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: PicoColors.amber.withValues(alpha: 0.5)),
      ),
      child: Row(children: [
        const Icon(Icons.science_outlined, color: PicoColors.amber, size: 18),
        const SizedBox(width: 8),
        Expanded(child: Text(text,
            style: const TextStyle(color: PicoColors.amber, fontSize: 13, fontWeight: FontWeight.w600))),
      ]),
    );
  }
}
