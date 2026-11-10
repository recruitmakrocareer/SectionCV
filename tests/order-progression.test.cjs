const test = require('node:test');
const assert = require('node:assert/strict');

test('orders start with one item and gradually grow without decreasing workload', async () => {
  const { orderFor } = await import('../worker/order-game.mjs');
  for (const day of ['2026-11-10', '2026-11-11', '2027-01-01']) {
    let previous = 0;
    for (let index = 0; index < 60; index++) {
      const order = orderFor(day, index);
      const total = order.reduce((a, b) => a + b, 0);
      assert.ok(total >= previous && total <= previous + 1);
      assert.equal(order[3], 0);
      assert.equal(order[7], 0);
      assert.ok(order.filter(Boolean).length <= 4);
      assert.ok(order.every(n => n >= 0 && n <= 3));
      assert.deepEqual(orderFor(day, index), order);
      previous = total;
    }
    assert.equal(orderFor(day, 0).reduce((a,b) => a+b, 0), 1);
    assert.equal(previous, 12);
  }
});
