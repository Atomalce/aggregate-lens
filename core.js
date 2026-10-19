const MAX_ITEMS = 50;
const MAX_CENTS = 100000000;

function validate(rows, name) {
  if (!Array.isArray(rows)) throw new TypeError(`${name} 必须是数组`);
  if (rows.length > MAX_ITEMS) throw new RangeError(`${name} 最多 ${MAX_ITEMS} 项`);
  const seen = new Set();
  for (const row of rows) {
    if (row === null || typeof row !== 'object') throw new TypeError(`${name} 的每一项必须是对象`);
    const { id, cents } = row;
    if (!Number.isSafeInteger(id) || id <= 0) throw new RangeError(`${name}.id 必须为正安全整数`);
    if (seen.has(id)) throw new RangeError(`${name}.id 在表内重复: ${id}`);
    seen.add(id);
    if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_CENTS) {
      throw new RangeError(`${name}.cents 必须是 0..${MAX_CENTS} 的安全整数`);
    }
  }
}

function sumValues(rows, pick, dedupByValue) {
  let total = 0;
  const seen = new Set();
  for (const row of rows) {
    const v = pick(row);
    if (v === null || v === undefined) continue;
    if (dedupByValue) {
      if (seen.has(v)) continue;
      seen.add(v);
    }
    total += v;
  }
  return total;
}

export function analyze(orders, refunds) {
  validate(orders, 'orders');
  validate(refunds, 'refunds');

  const os = orders.length ? orders : [null];
  const rs = refunds.length ? refunds : [null];
  const rows = [];
  for (const o of os) {
    for (const r of rs) {
      rows.push({
        orderId: o ? o.id : null,
        orderCents: o ? o.cents : null,
        refundId: r ? r.id : null,
        refundCents: r ? r.cents : null,
      });
    }
  }

  return {
    rows,
    naive: {
      orders: sumValues(rows, (row) => row.orderCents, false),
      refunds: sumValues(rows, (row) => row.refundCents, false),
    },
    distinct: {
      orders: sumValues(rows, (row) => row.orderCents, true),
      refunds: sumValues(rows, (row) => row.refundCents, true),
    },
    preaggregate: {
      orders: sumValues(orders, (row) => row.cents, false),
      refunds: sumValues(refunds, (row) => row.cents, false),
    },
  };
}

export function sqlFor(mode) {
  if (mode === 'naive') {
    return `SELECT
  COALESCE(SUM(o.amount_cents), 0) AS orderTotal,
  COALESCE(SUM(r.amount_cents), 0) AS refundTotal
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
LEFT JOIN refunds r ON r.customer_id = c.id
WHERE c.id = 1;`;
  }

  if (mode === 'distinct') {
    return `SELECT
  COALESCE(SUM(DISTINCT o.amount_cents), 0) AS orderTotal,
  COALESCE(SUM(DISTINCT r.amount_cents), 0) AS refundTotal
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
LEFT JOIN refunds r ON r.customer_id = c.id
WHERE c.id = 1;`;
  }

  if (mode === 'preaggregate') {
    return `WITH order_totals AS (
  SELECT customer_id, SUM(amount_cents) AS amount_cents FROM orders GROUP BY customer_id
),
refund_totals AS (
  SELECT customer_id, SUM(amount_cents) AS amount_cents FROM refunds GROUP BY customer_id
)
SELECT
  COALESCE(order_totals.amount_cents, 0) AS orderTotal,
  COALESCE(refund_totals.amount_cents, 0) AS refundTotal
FROM customers c
LEFT JOIN order_totals ON order_totals.customer_id = c.id
LEFT JOIN refund_totals ON refund_totals.customer_id = c.id
WHERE c.id = 1;`;
  }

  throw new Error(`未知模式: ${mode}（仅支持 naive/distinct/preaggregate）`);
}
