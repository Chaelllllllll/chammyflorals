const crypto = require('crypto');

describe('Outside Revenue & Sales Logic Tests', () => {
  test('generates order ID starting with OS and length <= 10 characters', () => {
    for (let i = 0; i < 20; i++) {
      const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
      const orderId = `OS${randomHex}`;
      expect(orderId.startsWith('OS')).toBe(true);
      expect(orderId.length).toBe(8);
      expect(orderId.length).toBeLessThanOrEqual(10);
    }
  });

  test('itemized order calculation computes correct totals for items and addons', () => {
    const items = [
      { flower_type: 'Rose Stem', quantity: 3, price: 150 },
      { flower_type: 'Tulip Stem', quantity: 2, price: 200 }
    ];
    const addons = [
      { name: 'Fairy Lights', price: 50 },
      { name: 'Greeting Card', price: 30 }
    ];

    const itemsSum = items.reduce((sum, it) => sum + (it.quantity * it.price), 0);
    const addonsSum = addons.reduce((sum, a) => sum + a.price, 0);
    const grandTotal = itemsSum + addonsSum;

    expect(itemsSum).toBe(850);
    expect(addonsSum).toBe(80);
    expect(grandTotal).toBe(930);
  });

  test('reports aggregation correctly separates outside_revenue and online_revenue', () => {
    const orders = [
      { order_id: 'ORD1', total_fee: 500, order_type: 'regular', status: 'Delivered' },
      { order_id: 'ORD2', total_fee: 1200, order_type: 'custom', status: 'Delivered' },
      { order_id: 'OS001', total_fee: 350, order_type: 'outside', status: 'Delivered' },
      { order_id: 'OS002', total_fee: 800, order_type: 'outside', status: 'Delivered' },
      { order_id: 'ORD3', total_fee: 450, order_type: 'regular', status: 'Pending' } // Pending should not count
    ];

    let total = 0;
    let outside_revenue = 0;
    let online_revenue = 0;

    const deliveredOrders = orders.filter(o => o.status.toLowerCase() === 'delivered');
    for (const o of deliveredOrders) {
      const fee = Number(o.total_fee) || 0;
      total += fee;
      if (o.order_type === 'outside') {
        outside_revenue += fee;
      } else {
        online_revenue += fee;
      }
    }

    expect(total).toBe(2850);
    expect(outside_revenue).toBe(1150);
    expect(online_revenue).toBe(1700);
    expect(outside_revenue + online_revenue).toBe(total);
  });

  test('filters orders by type properly', () => {
    const orders = [
      { order_id: 'ORD1', order_type: 'regular' },
      { order_id: 'ORD2', order_type: 'custom' },
      { order_id: 'OS001', order_type: 'outside' },
      { order_id: 'OS002', order_type: 'outside' }
    ];

    const filterByType = (type) => {
      if (type === 'outside') return orders.filter(o => o.order_type === 'outside');
      if (type === 'online') return orders.filter(o => o.order_type !== 'outside');
      return orders;
    };

    expect(filterByType('all').length).toBe(4);
    expect(filterByType('outside').length).toBe(2);
    expect(filterByType('online').length).toBe(2);
    expect(filterByType('outside').every(o => o.order_type === 'outside')).toBe(true);
    expect(filterByType('online').every(o => o.order_type !== 'outside')).toBe(true);
  });
});
