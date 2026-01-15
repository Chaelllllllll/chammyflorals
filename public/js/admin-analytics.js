// Admin Analytics — aggregates orders and renders charts
(function(){
  async function fetchOrders(){
    const token = localStorage.getItem('adminToken');
    if (!token) return window.location.href = '/admin/login.html';
    const res = await fetch('/api/admin/orders', { headers: { Authorization: `Bearer ${token}` } });
    if(!res.ok) {
      const body = await res.json().catch(()=>({}));
      throw new Error(body && body.error ? body.error : 'Failed to fetch orders');
    }
    return res.json();
  }

  function parseDateISO(s){
    // accept Date or ISO string
    if(!s) return null;
    return new Date(s);
  }

  function groupBy(list, keyFn){
    const map = new Map();
    for(const item of list){
      const k = keyFn(item);
      map.set(k, (map.get(k)||0) + (item.total_fee ? parseFloat(item.total_fee) || 0 : 0));
    }
    return map;
  }

  function lastNDaysLabels(n){
    const arr = [];
    for(let i = n-1; i>=0; i--){
      const d = new Date();
      d.setDate(d.getDate() - i);
      arr.push(d.toISOString().slice(0,10));
    }
    return arr;
  }

  function lastNMonthsLabels(n){
    const arr = [];
    const now = new Date();
    for(let i = n-1; i>=0; i--){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
    return arr;
  }

  function lastNYearsLabels(n){
    const arr = [];
    const now = new Date();
    for(let i = n-1; i>=0; i--){
      const y = now.getFullYear() - i;
      arr.push(String(y));
    }
    return arr;
  }

  function fillLabels(labels, map){
    return labels.map(l => +(map.get(l) || 0).toFixed(2));
  }

  // hold chart instances so we can destroy before redraw
  const _charts = { daily: null, monthly: null, yearly: null };

  function createChart(ctx, type, labels, data, label, slot){
    const common = { responsive:true, plugins:{legend:{display: type === 'pie'}}, scales: {} };
    if (type === 'bar') {
      common.scales = { x: { stacked: false }, y: { beginAtZero: true } };
      if (_charts[slot]) try{ _charts[slot].destroy(); }catch(e){}
      _charts[slot] = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label, data, backgroundColor: '#0d6efd' }] }, options: common });
      return _charts[slot];
    }
    if (type === 'pie') {
      // generate color palette
      const palette = labels.map((_,i)=>{
        const hue = Math.floor((i * 47) % 360);
        return `hsl(${hue} 80% 55%)`;
      });
      if (_charts[slot]) try{ _charts[slot].destroy(); }catch(e){}
      _charts[slot] = new Chart(ctx, { type: 'pie', data: { labels, datasets: [{ label, data, backgroundColor: palette }] }, options: common });
      return _charts[slot];
    }
    // fallback to line
    if (_charts[slot]) try{ _charts[slot].destroy(); }catch(e){}
    _charts[slot] = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label, data, borderColor: '#0d6efd', backgroundColor: 'rgba(13,110,253,0.08)', tension: 0.25, fill:true }] }, options: common });
    return _charts[slot];
  }

  async function render(){
    try{
      const orders = await fetchOrders();

      // normalize orders: ensure created_at and total_fee; only include delivered orders
      const normalized = (orders || []).map(o => ({
        created_at: parseDateISO(o.created_at || o.createdAt || o.date),
        total_fee: o.total_fee ?? o.totalFee ?? o.total,
        status: o.status || o.order_status || o.state
      })).filter(o => o.created_at instanceof Date && !isNaN(o.created_at) && String(o.status || '').toLowerCase() === 'delivered');

      // Daily: last 30 days grouped by YYYY-MM-DD
      const dailyMap = groupBy(normalized, o => o.created_at.toISOString().slice(0,10));
      const dailyLabels = lastNDaysLabels(30);
      const dailyData = fillLabels(dailyLabels, dailyMap);
      createChart(document.getElementById('chartDaily').getContext('2d'), 'bar', dailyLabels, dailyData, 'Revenue', 'daily');

      // Monthly: last 12 months grouped by YYYY-MM
      const monthlyMap = groupBy(normalized, o => `${o.created_at.getFullYear()}-${String(o.created_at.getMonth()+1).padStart(2,'0')}`);
      const monthlyLabels = lastNMonthsLabels(12);
      const monthlyData = fillLabels(monthlyLabels, monthlyMap);
      createChart(document.getElementById('chartMonthly').getContext('2d'), 'bar', monthlyLabels, monthlyData, 'Revenue', 'monthly');

      // Yearly: last 5 years grouped by YYYY
      const yearlyMap = groupBy(normalized, o => String(o.created_at.getFullYear()));
      const yearlyLabels = lastNYearsLabels(5);
      const yearlyData = fillLabels(yearlyLabels, yearlyMap);
      createChart(document.getElementById('chartYearly').getContext('2d'), 'pie', yearlyLabels, yearlyData, 'Revenue', 'yearly');

    }catch(err){
      console.error('Analytics render error', err);
      const container = document.querySelector('.main-content');
      const el = document.createElement('div');
      el.className = 'alert alert-danger mt-3';
      el.textContent = 'Failed to load analytics: ' + (err.message || err);
      container.prepend(el);
    }
  }

  document.addEventListener('DOMContentLoaded', render);
})();
