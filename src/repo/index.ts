import type { Db } from '../db/types';
import { makeBackupRepo } from './backup';
import { makeCustomersRepo } from './customers';
import { makeMachinesRepo } from './machines';
import { makeMetricsRepo } from './metrics';
import { makeOrdersRepo } from './orders';
import { makeProductsRepo } from './products';
import { makeSalesRepo } from './sales';
import { makeSettingsRepo } from './settings';
import { makeStockRepo } from './stock';

/** Uygulamanın tüm veri erişimi tek bir `Repo` nesnesi üzerinden geçer.
 *  Sunucuya geçerken aynı şekle sahip bir API istemcisi yazılıp `createRepo` yerine kullanılır
 *  (bkz. README → "Sunucuya geçiş"). */
export function createRepo(db: Db) {
  const settings = makeSettingsRepo(db);
  const products = makeProductsRepo(db);
  const stock = makeStockRepo(db, settings, products);
  return {
    settings,
    products,
    stock,
    customers: makeCustomersRepo(db),
    machines: makeMachinesRepo(db),
    sales: makeSalesRepo(db),
    orders: makeOrdersRepo(db),
    metrics: makeMetricsRepo(db),
    backup: makeBackupRepo(db),
  };
}
export type Repo = ReturnType<typeof createRepo>;
