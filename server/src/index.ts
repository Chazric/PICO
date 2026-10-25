import { config } from './config.js';
import { openDb } from './db.js';
import { makeBilling } from './billing.js';
import { MockSupplier } from './supplier/mock.js';
import { EsimAccessSupplier } from './supplier/esimaccess.js';
import type { SupplierAdapter } from './supplier/types.js';
import { Provisioner } from './provisioning.js';
import { createApp } from './app.js';

const db = openDb(config.databasePath);
const billing = makeBilling();
let supplier: SupplierAdapter;
if (config.supplierAdapter === 'esimaccess') {
  const esa = new EsimAccessSupplier(config.esimAccess);
  try {
    await esa.refreshCatalog();
  } catch (err) {
    console.error('eSIM Access catalog load failed; catalog is empty until the next refresh', err);
  }
  setInterval(() => esa.refreshCatalog().catch(e => console.error('catalog refresh failed', e)), 6 * 3600_000).unref();
  supplier = esa;
} else {
  supplier = new MockSupplier();
}
const provisioner = new Provisioner(db, supplier);
const app = createApp({ db, billing, supplier, provisioner });

app.listen(config.port, () => {
  console.log(`PICO server on :${config.port} (billing=${billing.mode}, supplier=${supplier.name}${config.supplierAdapter === 'esimaccess' ? `, orders=${config.esimAccess.ordersEnabled ? 'ENABLED' : 'disabled'}` : ''})`);
});
