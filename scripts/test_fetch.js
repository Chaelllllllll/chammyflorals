require('dotenv').config();
const supabase = require('../src/config/supabase');

async function run() {
  console.log('Testing Supabase connection...');
  try {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .limit(5);
    
    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
    } else {
      console.log('Orders fetch successful. Count:', orders.length);
      console.log('Sample order:', orders[0]);
    }

    const { data: customOrders, error: customError } = await supabase
      .from('custom_orders')
      .select('*')
      .limit(5);
      
    if (customError) {
      console.error('Error fetching custom orders:', customError);
    } else {
      console.log('Custom orders fetch successful. Count:', customOrders.length);
      console.log('Sample custom order:', customOrders[0]);
    }
  } catch (err) {
    console.error('Exception thrown during test:', err);
  }
}

run();
