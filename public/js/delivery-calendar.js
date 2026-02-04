// Custom Delivery Calendar with Order Counts
class DeliveryCalendar {
  constructor(inputId, options = {}) {
    this.input = document.getElementById(inputId);
    if (!this.input) {
      return;
    }
    
    this.options = {
      onChange: options.onChange || null,
      onRushDetected: options.onRushDetected || null,
      minDate: options.minDate || this.getMinimumDate(),
      theme: options.theme || 'pink'
    };
    
    this.currentDate = new Date();
    this.selectedDate = null;
    this.orderDates = [];
    this.calendarVisible = false;
    
    this.init();
  }
  
  async init() {
    this.createCalendarElement();
    this.attachEventListeners();
    this.renderCalendar(); // Render first with empty data
    await this.fetchOrderDates();
    this.renderCalendar(); // Re-render with order data
  }
  
  createCalendarElement() {
    // Create backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'delivery-calendar-backdrop';
    this.backdrop.style.display = 'none';
    document.body.appendChild(this.backdrop);
    
    // Create calendar container (modal)
    this.calendar = document.createElement('div');
    this.calendar.className = 'delivery-calendar delivery-calendar-modal';
    this.calendar.style.display = 'none';
    document.body.appendChild(this.calendar);
    
    // Click backdrop to close
    this.backdrop.addEventListener('click', () => this.hide());
  }
  
  attachEventListeners() {
    // Show calendar when input is clicked
    this.input.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.show();
    });
    
    // Also show on focus
    this.input.addEventListener('focus', (e) => {
      e.preventDefault();
      this.show();
    });
    
    // Prevent calendar clicks from closing it
    this.calendar.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  
  async fetchOrderDates() {
    try {
      const response = await fetch('/api/orders/delivery-dates');
      if (response.ok) {
        this.orderDates = await response.json();
      }
    } catch (error) {
      this.orderDates = [];
    }
  }
  
  getOrderCountForDate(date) {
    const dateStr = this.formatDate(date);
    const found = this.orderDates.find(od => od.date === dateStr);
    return found ? found.count : 0;
  }
  
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  getMinimumDate() {
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 1); // Add 1 day (tomorrow)
    minDate.setHours(0, 0, 0, 0);
    return minDate;
  }
  
  isRushOrder(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    const diffTime = date - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 3;
  }
  
  renderCalendar() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const prevLastDay = new Date(year, month, 0);
    
    const firstDayOfWeek = firstDay.getDay();
    const lastDate = lastDay.getDate();
    const prevLastDate = prevLastDay.getDate();
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    let html = `
      <div class="calendar-header">
        <button type="button" class="calendar-nav-btn" data-nav="prev">
          <i class="fa fa-chevron-left"></i>
        </button>
        <div class="calendar-month-year">
          ${monthNames[month]} ${year}
        </div>
        <button type="button" class="calendar-nav-btn" data-nav="next">
          <i class="fa fa-chevron-right"></i>
        </button>
      </div>
      
      <div class="calendar-weekdays">
        <div>Su</div>
        <div>Mo</div>
        <div>Tu</div>
        <div>We</div>
        <div>Th</div>
        <div>Fr</div>
        <div>Sa</div>
      </div>
      
      <div class="calendar-days">
    `;
    
    // Previous month's trailing days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = prevLastDate - i;
      html += `<div class="calendar-day prev-month">${day}</div>`;
    }
    
    // Current month's days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minDate = new Date(this.options.minDate);
    minDate.setHours(0, 0, 0, 0);
    
    for (let day = 1; day <= lastDate; day++) {
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);
      
      const isToday = date.getTime() === today.getTime();
      const isSelected = this.selectedDate && date.getTime() === this.selectedDate.getTime();
      const isPast = date < minDate;
      const orderCount = this.getOrderCountForDate(date);
      const isRush = this.isRushOrder(date);
      const isFull = orderCount >= 5;
      
      let classes = ['calendar-day'];
      if (isToday) classes.push('today');
      if (isSelected) classes.push('selected');
      if (isPast || isFull) classes.push('disabled');
      if (isRush && !isPast && !isFull) classes.push('rush-date');
      
      html += `
        <div class="${classes.join(' ')}" data-date="${this.formatDate(date)}" data-full="${isFull}">
          <span class="day-number">${day}</span>
          ${orderCount > 0 ? `<span class="order-count">${orderCount}</span>` : ''}
          ${isRush && !isPast && !isFull ? '<span class="rush-indicator"><i class="fa fa-bolt"></i></span>' : ''}
          ${isFull && !isPast ? '<span class="full-indicator">FULL</span>' : ''}
        </div>
      `;
    }
    
    // Next month's leading days
    const totalCells = firstDayOfWeek + lastDate;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day++) {
      html += `<div class="calendar-day next-month">${day}</div>`;
    }
    
    html += `
      </div>
      
      <div class="calendar-footer">
        <button type="button" class="calendar-btn calendar-btn-today">Today</button>
        <button type="button" class="calendar-btn calendar-btn-clear">Clear</button>
      </div>
      
      <div class="calendar-legend">
        <div class="legend-item">
          <span class="legend-icon rush-icon"><i class="fa fa-bolt"></i></span>
          <span class="legend-text">Rush (2-3 days)</span>
        </div>
      </div>
    `;
    
    this.calendar.innerHTML = html;
    this.attachCalendarEventListeners();
  }
  
  attachCalendarEventListeners() {
    // Navigation buttons
    this.calendar.querySelectorAll('.calendar-nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nav = btn.dataset.nav;
        if (nav === 'prev') {
          this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        } else {
          this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        }
        this.renderCalendar();
      });
    });
    
    // Day selection
    this.calendar.querySelectorAll('.calendar-day:not(.prev-month):not(.next-month)').forEach(day => {
      day.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Check if date is full
        if (day.dataset.full === 'true') {
          if (window.alertWarning) {
            window.alertWarning('This date is fully booked (maximum 5 orders). Please select another date.');
          }
          return;
        }
        
        // Check if disabled (past date)
        if (day.classList.contains('disabled')) {
          return;
        }
        
        const dateStr = day.dataset.date;
        if (dateStr) {
          const [year, month, dayNum] = dateStr.split('-').map(Number);
          this.selectedDate = new Date(year, month - 1, dayNum);
          this.input.value = dateStr;
          
          // Trigger change callback
          if (this.options.onChange) {
            this.options.onChange(this.selectedDate, dateStr);
          }
          
          // Check if rush order
          if (this.isRushOrder(this.selectedDate) && this.options.onRushDetected) {
            this.options.onRushDetected(true);
          } else if (this.options.onRushDetected) {
            this.options.onRushDetected(false);
          }
          
          this.hide();
        }
      });
    });
    
    // Today button
    const todayBtn = this.calendar.querySelector('.calendar-btn-today');
    if (todayBtn) {
      todayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const today = new Date();
        this.selectedDate = today;
        this.currentDate = new Date(today);
        this.input.value = this.formatDate(today);
        
        if (this.options.onChange) {
          this.options.onChange(this.selectedDate, this.formatDate(today));
        }
        
        if (this.isRushOrder(this.selectedDate) && this.options.onRushDetected) {
          this.options.onRushDetected(true);
        }
        
        this.hide();
      });
    }
    
    // Clear button
    const clearBtn = this.calendar.querySelector('.calendar-btn-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedDate = null;
        this.input.value = '';
        
        if (this.options.onChange) {
          this.options.onChange(null, '');
        }
        
        if (this.options.onRushDetected) {
          this.options.onRushDetected(false);
        }
        
        this.hide();
      });
    }
  }
  
  show() {
    if (this.calendarVisible) return;
    this.backdrop.style.display = 'block';
    this.calendar.style.display = 'block';
    this.calendarVisible = true;
    // Trigger animation
    setTimeout(() => {
      this.backdrop.classList.add('show');
      this.calendar.classList.add('show');
    }, 10);
  }
  
  hide() {
    if (!this.calendarVisible) return;
    this.backdrop.classList.remove('show');
    this.calendar.classList.remove('show');
    setTimeout(() => {
      this.backdrop.style.display = 'none';
      this.calendar.style.display = 'none';
      this.calendarVisible = false;
    }, 300);
  }
  
  async refresh() {
    await this.fetchOrderDates();
    this.renderCalendar();
  }
}

// Export for use
window.DeliveryCalendar = DeliveryCalendar;
