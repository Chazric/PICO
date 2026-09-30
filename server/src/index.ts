import { config } from './config.js';
import { openDb } from './db.js';
import { makeBilling } from './billing.js';
import { MockSupplier } from './supplier/mock.js';
import { Provisioner } from './provisioning.js';
import { createApp } from './app.js';

const db = openDb(config.databasePath);
const billing = makeBilling();
const supplier = new MockSupplier(); // Sprint 1: mock adapter only (spec §12, §17)
const provisioner = new Provisioner(db, supplier);
const app = createApp({ db, billing, supplier, provisioner });

app.listen(config.port, () => {
  console.log(`PICO server on :${config.port} (billing=${billing.mode}, supplier=${supplier.name})`);
});
