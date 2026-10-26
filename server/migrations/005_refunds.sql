-- Cancel & refund (admin): Stripe refund id kept on the order for reconciliation.
ALTER TABLE orders ADD COLUMN refund_id TEXT;
