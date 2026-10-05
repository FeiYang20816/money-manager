(function () {
  "use strict";

  const STORAGE_KEY = "money-manager-web-v1";
  const SETTINGS_KEY = "money-manager-web-settings-v1";
  const REPORTS_KEY = "money-manager-web-reports-v1";
  const native = window.AndroidBridge || null;
  if (native) document.body.classList.add("native-app");
  function readStorage(key) { return native ? native.read(key) : window.localStorage.getItem(key); }
  const EXPENSE_CATEGORIES = ["餐饮", "交通", "购物", "住房", "娱乐", "医疗", "学习", "通讯", "日用", "其他"];
  const INCOME_CATEGORIES = ["工资", "兼职", "退款", "理财", "其他"];
  const CATEGORY_STYLE = {
    "餐饮": { icon: "🍜", bg: "#fff0e8" },
    "交通": { icon: "🚇", bg: "#eaf3ff" },
    "购物": { icon: "🛍️", bg: "#f5edff" },
    "住房": { icon: "🏠", bg: "#fff3e3" },
    "娱乐": { icon: "🎬", bg: "#ffeef3" },
    "医疗": { icon: "💊", bg: "#eaf8f0" },
    "学习": { icon: "📚", bg: "#edf2ff" },
    "通讯": { icon: "📱", bg: "#eef7fb" },
    "日用": { icon: "🧺", bg: "#f6f1e9" },
    "工资": { icon: "💼", bg: "#e9f8f0" },
    "兼职": { icon: "✨", bg: "#eef8ee" },
    "退款": { icon: "↩️", bg: "#e9f8f0" },
    "理财": { icon: "📈", bg: "#e9f8f0" },
    "其他": { icon: "🧾", bg: "#f3f1ee" }
  };
  const CHART_COLORS = ["#e85157", "#f4a26b", "#8c8bd4", "#78b8cf", "#a7c999", "#d9bc9f"];

  const view = document.getElementById("view");
  const entryModal = document.getElementById("entryModal");
  const toolsModal = document.getElementById("toolsModal");
  const entryForm = document.getElementById("entryForm");
  const importFile = document.getElementById("importFile");
  const current = new Date();
  const requestedPage = new URLSearchParams(window.location.search).get("page");
  const state = {
    page: ["home", "bills", "stats", "me", "assets", "reports"].includes(requestedPage) ? requestedPage : "home",
    month: new Date(current.getFullYear(), current.getMonth(), 1),
    selectedDate: dateKey(current),
    query: "",
    type: "expense",
    editingId: null,
    importType: null,
    reportTab: "monthly",
    reportPeriod: null
  };
  let records = loadRecords();
  let settings = loadSettings();
  let reports = { monthly: {}, yearly: {} };
  let toastTimer;

  function pad(value) { return String(value).padStart(2, "0"); }
  function dateKey(date) { return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()); }
  function localInput(date) { return dateKey(date) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes()); }
  function monthKey(date) { return date.getFullYear() + "-" + pad(date.getMonth() + 1); }
  function monthLabel(date) { return date.getFullYear() + "年" + (date.getMonth() + 1) + "月"; }
  function money(cents, digits) {
    const places = digits === undefined ? 2 : digits;
    return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: places, maximumFractionDigits: places }).format(cents / 100);
  }
  function shortMoney(cents) {
    const value = cents / 100;
    return value >= 10000 ? (value / 10000).toFixed(1) + "万" : (Number.isInteger(value) ? String(value) : value.toFixed(1));
  }
  function signedMoney(cents) { return (cents < 0 ? "−" : "") + "¥" + money(Math.abs(cents)); }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function normalizeRecord(raw) {
    if (!raw || typeof raw !== "object") return null;
    const type = raw.type === "income" ? "income" : raw.type === "expense" ? "expense" : null;
    const cents = Number(raw.amountCents);
    const occurredAt = String(raw.occurredAt || "");
    if (!type || !Number.isSafeInteger(cents) || cents <= 0 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(occurredAt)) return null;
    const parsed = new Date(occurredAt);
    if (Number.isNaN(parsed.getTime()) || dateKey(parsed) !== occurredAt.slice(0, 10)) return null;
    const rawId = String(raw.id || "");
    return {
      id: /^[A-Za-z0-9_-]{1,80}$/.test(rawId) ? rawId : makeId(),
      type: type,
      amountCents: cents,
      category: String(raw.category || "其他").slice(0, 30),
      note: String(raw.note || "").slice(0, 80),
      occurredAt: occurredAt
    };
  }
  function seedRecords() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const maxDay = now.getDate();
    const data = [];
    function add(m, day, hour, type, yuan, category, note) {
      if (m === month && day > maxDay) return;
      data.push({
        id: makeId(),
        type: type,
        amountCents: Math.round(yuan * 100),
        category: category,
        note: note,
        occurredAt: year + "-" + pad(m + 1) + "-" + pad(day) + "T" + pad(hour) + ":00"
      });
    }
    for (let m = 0; m < month; m++) {
      add(m, 2, 9, "income", 9300 + m * 70, "工资", "工资到账");
      add(m, 3, 12, "expense", 58 + m * 3, "餐饮", "午餐");
      add(m, 7, 18, "expense", 220 + m * 9, "购物", "生活用品");
      add(m, 12, 8, "expense", 138, "交通", "通勤");
      add(m, 16, 19, "expense", 89 + m * 5, "娱乐", "周末活动");
      add(m, 22, 11, "expense", 310 + m * 13, "餐饮", "聚餐");
      add(m, 27, 14, "expense", 450, "住房", "水电物业");
    }
    add(month, 1, 9, "income", 9300, "工资", "工资到账");
    add(month, 1, 12, "expense", 68, "餐饮", "工作日午餐");
    add(month, 1, 18, "expense", 12, "交通", "地铁");
    add(month, 2, 10, "expense", 32, "餐饮", "咖啡");
    add(month, 2, 19, "expense", 186.5, "日用", "超市采购");
    add(month, 3, 13, "expense", 39, "餐饮", "午餐");
    add(month, 3, 21, "expense", 45, "交通", "打车回家");
    add(month, 3, 16, "income", 600, "兼职", "设计兼职");
    add(month, 4, 15, "expense", 88, "娱乐", "电影票");
    add(month, 4, 11, "expense", 120, "学习", "校园卡充值");
    add(month, 4, 17, "expense", 239, "购物", "运动鞋");
    add(month, 5, 9, "expense", 56, "餐饮", "早午餐");
    add(month, 5, 11, "expense", 6, "交通", "公交");
    add(month, 5, 13, "income", 60, "退款", "购物退款");
    return data;
  }
  function loadRecords() {
    try {
      const saved = readStorage(STORAGE_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.map(normalizeRecord).filter(Boolean);
      }
    } catch (error) {}
    const demo = native ? [] : seedRecords();
    try { if (!native) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demo)); } catch (error) {}
    return demo;
  }
  function persist() {
    try {
      if (native) {
        const error = native.save(JSON.stringify(records), JSON.stringify(settings));
        if (error) throw new Error(error);
      } else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch (error) {
      records = loadRecords(); settings = loadSettings();
      showToast(error.message || "保存失败，请先导出备份"); return false;
    }
  }
  function loadSettings() {
    const firstRecordedMonth = records.length ? records.map(function (record) { return record.occurredAt.slice(0, 7); }).sort()[0] : monthKey(new Date());
    try {
      const parsed = JSON.parse(readStorage(SETTINGS_KEY));
      if (parsed && Number.isSafeInteger(parsed.openingAssetCents)) {
        return {
          openingAssetCents: parsed.openingAssetCents,
          trackingStartMonth: /^\d{4}-(0[1-9]|1[0-2])$/.test(parsed.trackingStartMonth || "") ? parsed.trackingStartMonth : firstRecordedMonth
        };
      }
    } catch (error) {}
    return { openingAssetCents: 0, trackingStartMonth: firstRecordedMonth };
  }
  function persistSettings() {
    if (native) return persist();
    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; }
    catch (error) { showToast("资产设置未能保存，请先导出备份"); return false; }
  }
  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2800);
  }
  function sum(list, type) {
    return list.reduce(function (total, record) { return total + (record.type === type ? record.amountCents : 0); }, 0);
  }
  function inMonth(record, month) { return record.occurredAt.slice(0, 7) === monthKey(month); }
  function monthRecords() { return records.filter(function (record) { return inMonth(record, state.month); }); }
  function sorted(list) { return list.slice().sort(function (a, b) { return b.occurredAt.localeCompare(a.occurredAt); }); }
  function isCampusCardException(record) {
    return record.type === "expense" && record.amountCents > 5000 && record.note.replace(/\s+/g, "").includes("校园卡");
  }
  function isLuxury(record) {
    return record.type === "expense" && record.amountCents > 5000 && !isCampusCardException(record);
  }
  function categoryStyle(category) { return CATEGORY_STYLE[category] || CATEGORY_STYLE["其他"]; }
  function dateCaption(value) {
    const date = new Date(value);
    return (date.getMonth() + 1) + "月" + date.getDate() + "日 " + value.slice(11, 16);
  }
  function entryRow(record) {
    const style = categoryStyle(record.category);
    const title = record.note || record.category;
    const luxury = isLuxury(record) ? '<span class="luxury-tag">奢侈消费</span>' : "";
    const campus = isCampusCardException(record) ? '<span class="campus-tag">校园卡 · 不计奢侈消费</span>' : "";
    return '<button type="button" class="entry-row" data-action="edit" data-id="' + escapeHtml(record.id) + '">' +
      '<span class="category-bubble" style="--bubble:' + style.bg + '">' + style.icon + '</span>' +
      '<span class="entry-main"><strong>' + escapeHtml(title) + '</strong><small>' + escapeHtml(record.category) + ' · ' + dateCaption(record.occurredAt) + '</small>' + luxury + campus + '</span>' +
      '<span class="entry-value ' + record.type + '">' + (record.type === "expense" ? "−" : "+") + '¥' + money(record.amountCents) + '</span></button>';
  }
  function entryList(list, emptyText) {
    return list.length ? '<div class="entry-list">' + sorted(list).map(entryRow).join("") + '</div>' : '<div class="empty">' + emptyText + '</div>';
  }
  function monthControls() {
    return '<div class="month-controls">' +
      '<button type="button" class="month-arrow" data-action="prev-month" aria-label="上个月">‹</button>' +
      '<span class="month-text">' + monthLabel(state.month) + '</span>' +
      '<button type="button" class="month-arrow" data-action="next-month" aria-label="下个月">›</button></div>';
  }
  function pageHeader(title, subtitle, right) {
    return '<header class="page-header"><div><p class="eyebrow">' + subtitle + '</p><h1 class="page-title">' + title + '</h1></div>' + (right || "") + '</header>';
  }
  function renderHome() {
    const monthly = monthRecords();
    const expense = sum(monthly, "expense");
    const income = sum(monthly, "income");
    const balance = income - expense;
    const today = new Date();
    const firstRecentDay = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4));
    const lastRecentDay = dateKey(today);
    const recent = records.filter(function (record) {
      const day = record.occurredAt.slice(0, 10);
      return day >= firstRecentDay && day <= lastRecentDay;
    });
    return pageHeader("好好记账", "MONEY MANAGER", '<span class="header-badge">网页预览</span>') +
      '<section class="home-hero">' +
      '<div class="hero-top"><span class="hero-label">本月支出</span>' + monthControls() + '</div>' +
      '<div class="hero-amount"><small>¥</small>' + money(expense) + '</div>' +
      '<p class="hero-caption">每一笔，都让生活更清晰。</p>' +
      '<div class="cta-wrap"><button type="button" class="circle-cta" data-action="add" aria-label="记一笔"><span class="plus">＋</span><span>记一笔</span></button><span class="cta-hint">点击快速记录收支</span></div>' +
      '</section>' +
      '<div class="summary-grid"><div class="stat-mini income"><span>本月收入</span><strong>¥' + money(income) + '</strong></div>' +
      '<div class="stat-mini balance"><span>本月结余</span><strong>' + (balance < 0 ? "−" : "") + '¥' + money(Math.abs(balance)) + '</strong></div></div>' +
      '<div class="section-heading"><h2>最近 5 天账单</h2><button type="button" class="text-link" data-action="go-bills">查看全部 ›</button></div>' +
      entryList(recent, "最近 5 天还没有账单，点上方按钮记一笔。");
  }
  function calendarHtml() {
    const year = state.month.getFullYear();
    const month = state.month.getMonth();
    const todayDate = new Date();
    const todayKey = dateKey(todayDate);
    const firstDay = new Date(year, month, 1);
    const firstWeekday = (firstDay.getDay() + 6) % 7;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const monthly = monthRecords();
    const daily = {};
    monthly.forEach(function (record) {
      const day = record.occurredAt.slice(0, 10);
      if (!daily[day]) daily[day] = { expense: 0, income: 0 };
      daily[day][record.type] += record.amountCents;
    });
    let cells = "";
    for (let i = 0; i < firstWeekday; i++) cells += '<span class="day-cell empty-day"></span>';
    for (let day = 1; day <= totalDays; day++) {
      const key = year + "-" + pad(month + 1) + "-" + pad(day);
      const sums = daily[key] || { expense: 0, income: 0 };
      const selected = key === state.selectedDate ? " selected" : "";
      const isToday = key === todayKey;
      cells += '<button type="button" class="day-cell' + selected + (isToday ? " today" : "") + '" data-action="select-day" data-date="' + key + '" aria-current="' + (isToday ? 'date' : 'false') + '" aria-pressed="' + (selected ? 'true' : 'false') + '" aria-label="' + key + ' 支出' + money(sums.expense) + '元 收入' + money(sums.income) + '元">' +
        '<span class="day-number">' + day + '</span>' +
        (sums.expense ? '<span class="day-flow expense">−' + shortMoney(sums.expense) + '</span>' : '') +
        (sums.income ? '<span class="day-flow income">+' + shortMoney(sums.income) + '</span>' : '') +
        '</button>';
    }
    return '<section class="calendar-card"><div class="calendar-head"><h2>账单日历</h2>' + monthControls() + '</div>' +
      '<div class="weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>' +
      '<div class="calendar-grid">' + cells + '</div></section>';
  }
  function billDetailHtml() {
    const query = state.query.trim().toLocaleLowerCase();
    if (query) {
      const matched = records.filter(function (record) {
        return record.note.toLocaleLowerCase().includes(query) || record.category.toLocaleLowerCase().includes(query);
      });
      return '<div class="section-heading"><h2>搜索结果 · ' + matched.length + ' 笔</h2></div>' +
        entryList(matched, "没有找到相关账单，换个关键词试试。");
    }
    const list = records.filter(function (record) { return record.occurredAt.slice(0, 10) === state.selectedDate; });
    const date = new Date(state.selectedDate + "T12:00");
    const title = (date.getMonth() + 1) + "月" + date.getDate() + "日账单";
    return '<div class="section-heading day-detail-head"><h2>' + title + '</h2><span class="day-totals">支 <b>¥' + money(sum(list, "expense")) + '</b> · 收 <i>¥' + money(sum(list, "income")) + '</i></span></div>' +
      entryList(list, "这一天还没有记录。");
  }
  function renderBills() {
    return pageHeader("账单", "YOUR BILLS", '<span class="header-badge">按月查看</span>') +
      '<div class="search-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 5 5"/></svg>' +
      '<input id="billSearch" type="search" placeholder="搜索备注或分类" value="' + escapeHtml(state.query) + '" aria-label="搜索账单">' +
      '<button type="button" id="clearSearch" class="clear-search" data-action="clear-search" aria-label="清除搜索"' + (state.query ? "" : " hidden") + '>×</button></div>' +
      calendarHtml() + '<div id="billDetail">' + billDetailHtml() + '</div>';
  }
  function trendSvg(monthly) {
    const days = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 0).getDate();
    const values = Array.from({ length: days }, function () { return 0; });
    monthly.forEach(function (record) {
      if (record.type === "expense") values[Number(record.occurredAt.slice(8, 10)) - 1] += record.amountCents;
    });
    const max = Math.max.apply(null, values.concat([100]));
    const points = values.map(function (value, index) {
      const x = 8 + index * 324 / Math.max(days - 1, 1);
      const y = 116 - value * 88 / max;
      return [x.toFixed(1), y.toFixed(1)];
    });
    const line = points.map(function (point, index) { return (index ? "L" : "M") + point[0] + " " + point[1]; }).join(" ");
    const area = line + " L332 116 L8 116 Z";
    const last = points[points.length - 1];
    return '<svg class="trend-svg" viewBox="0 0 340 140" role="img" aria-label="本月每日支出趋势">' +
      '<defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#e85157" stop-opacity=".22"/><stop offset="100%" stop-color="#e85157" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="M8 28 H332 M8 72 H332 M8 116 H332" fill="none" stroke="#f0edea" stroke-dasharray="3 5"/>' +
      '<path d="' + area + '" fill="url(#trendFill)"/><path d="' + line + '" fill="none" stroke="#e85157" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="3.5" fill="#e85157" stroke="#fff" stroke-width="2"/></svg>';
  }
  function categoryTotals(monthly) {
    const totals = {};
    monthly.forEach(function (record) {
      if (record.type === "expense") totals[record.category] = (totals[record.category] || 0) + record.amountCents;
    });
    return Object.keys(totals).map(function (name) { return { name: name, amount: totals[name] }; })
      .sort(function (a, b) { return b.amount - a.amount; });
  }
  function donutHtml(categories, total) {
    if (!total) return '<div class="empty" style="margin-top:17px">本月还没有支出数据。</div>';
    const top = categories.slice(0, 5);
    if (categories.length > 5) {
      top.push({ name: "其余分类", amount: categories.slice(5).reduce(function (sum, item) { return sum + item.amount; }, 0) });
    }
    let start = 0;
    const stops = [];
    const legend = [];
    top.forEach(function (item, index) {
      const end = start + item.amount / total * 100;
      const color = CHART_COLORS[index];
      stops.push(color + " " + start.toFixed(2) + "% " + end.toFixed(2) + "%");
      legend.push('<div class="legend-item" style="--dot:' + color + '"><span>' + escapeHtml(item.name) + '</span><b>' + Math.round(item.amount / total * 100) + '%</b></div>');
      start = end;
    });
    return '<div class="donut-layout"><div class="donut" style="background:conic-gradient(' + stops.join(",") + ')"><div class="donut-hole"><small>总支出</small><strong>¥' + money(total, 0) + '</strong></div></div><div class="legend">' + legend.join("") + '</div></div>';
  }
  function rankHtml(categories) {
    if (!categories.length) return '<div class="empty" style="margin-top:15px">暂无消费排行。</div>';
    const max = categories[0].amount;
    return '<div class="rank-list">' + categories.slice(0, 5).map(function (item, index) {
      return '<div class="rank-row"><div class="rank-top"><span class="rank-name"><b>' + pad(index + 1) + '</b>' + escapeHtml(item.name) + '</span><strong>¥' + money(item.amount) + '</strong></div>' +
        '<div class="rank-bar"><span style="width:' + Math.max(3, item.amount / max * 100).toFixed(1) + '%"></span></div></div>';
    }).join("") + '</div>';
  }
  function annualHtml() {
    const year = state.month.getFullYear();
    const yearly = records.filter(function (record) { return record.occurredAt.slice(0, 4) === String(year); });
    const yearlyExpense = sum(yearly, "expense");
    const yearlyIncome = sum(yearly, "income");
    const monthValues = Array.from({ length: 12 }, function () { return 0; });
    yearly.forEach(function (record) {
      if (record.type === "expense") monthValues[Number(record.occurredAt.slice(5, 7)) - 1] += record.amountCents;
    });
    const max = Math.max.apply(null, monthValues.concat([100]));
    const bars = monthValues.map(function (value, index) {
      const currentClass = index === state.month.getMonth() ? " current" : "";
      return '<div class="annual-col' + currentClass + '" title="' + (index + 1) + '月支出 ¥' + money(value) + '">' +
        '<div class="bar-track"><div class="bar-fill" style="height:' + Math.max(2, value / max * 100).toFixed(1) + '%"></div></div><small>' + (index + 1) + '月</small></div>';
    }).join("");
    const balance = yearlyIncome - yearlyExpense;
    return '<section class="chart-card"><div class="card-head"><div><h2>' + year + ' 年度统计</h2><p class="card-subtitle">全年收支一目了然</p></div></div>' +
      '<div class="annual-summary"><div><small>年度支出</small><strong>¥' + money(yearlyExpense, 0) + '</strong></div>' +
      '<div><small>年度收入</small><strong>¥' + money(yearlyIncome, 0) + '</strong></div>' +
      '<div><small>年度结余</small><strong>' + (balance < 0 ? "−" : "") + '¥' + money(Math.abs(balance), 0) + '</strong></div></div>' +
      '<div class="annual-bars" role="img" aria-label="' + year + '年每月支出柱状图">' + bars + '</div></section>';
  }
  function renderStats() {
    const monthly = monthRecords();
    const expense = sum(monthly, "expense");
    const categories = categoryTotals(monthly);
    const days = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 0).getDate();
    return pageHeader("统计", "INSIGHTS", monthControls()) +
      '<section class="chart-card"><div class="card-head"><div><h2>月消费趋势</h2><p class="card-subtitle">每天花了多少</p></div><strong class="card-amount">¥' + money(expense) + '</strong></div>' +
      trendSvg(monthly) + '<div class="chart-axis"><span>1日</span><span>' + Math.ceil(days / 2) + '日</span><span>' + days + '日</span></div></section>' +
      '<section class="chart-card"><h2>分类占比</h2><p class="card-subtitle">本月支出都去了哪里</p>' + donutHtml(categories, expense) + '</section>' +
      '<section class="chart-card"><h2>消费排行</h2><p class="card-subtitle">按分类支出金额排序</p>' + rankHtml(categories) + '</section>' +
      annualHtml();
  }
  function renderAssets() {
    const total = settings.openingAssetCents + sum(records, "income") - sum(records, "expense");
    const byMonth = {};
    records.forEach(function (record) {
      const key = record.occurredAt.slice(0, 7);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(record);
    });
    const currentKey = monthKey(new Date());
    if (!byMonth[currentKey]) byMonth[currentKey] = [];
    const rows = Object.keys(byMonth).sort().reverse().map(function (key) {
      const income = sum(byMonth[key], "income");
      const expense = sum(byMonth[key], "expense");
      const surplus = income - expense;
      return '<div class="asset-row"><div><strong>' + key.slice(0, 4) + '年' + Number(key.slice(5)) + '月</strong>' +
        '<small>收入 ¥' + money(income) + ' · 支出 ¥' + money(expense) + '</small></div>' +
        '<b class="' + (surplus < 0 ? 'negative' : 'positive') + '">' + signedMoney(surplus) + '</b></div>';
    }).join("");
    return '<button type="button" class="back-link" data-action="back-me">‹ 返回我的</button>' +
      pageHeader("资产", "MY ASSETS", '') +
      '<section class="asset-hero"><span>当前总资产</span><strong>' + signedMoney(total) + '</strong><small>期初资产 + 已记账收入 − 已记账支出</small></section>' +
      '<section class="chart-card asset-opening"><h2>期初资产</h2><p class="card-subtitle">开始记账前已有的金额，可为负数</p>' +
      '<form id="openingAssetForm"><div class="opening-input"><span>¥</span><input id="openingAsset" type="number" step="0.01" inputmode="decimal" value="' + (settings.openingAssetCents / 100).toFixed(2) + '" aria-label="期初资产"></div>' +
      '<button type="submit">保存</button></form></section>' +
      '<div class="section-heading"><h2>每月盈余</h2><span class="subtle-label">收入 − 支出</span></div>' +
      '<div class="asset-list">' + rows + '</div>' +
      '<p class="storage-note">总资产按账本记录计算。补记、修改或删除账单后，金额会同步更新。</p>';
  }
  function isMonthEnd(date) { return date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(); }
  function isYearEnd(date) { return date.getMonth() === 11 && date.getDate() === 31; }
  function monthReport(key) {
    const list = records.filter(function (record) { return record.occurredAt.slice(0, 7) === key; });
    const income = sum(list, "income");
    const expense = sum(list, "expense");
    const luxury = list.filter(isLuxury);
    const campusCount = list.filter(isCampusCardException).length;
    const categories = categoryTotals(list);
    return {
      income: income, expense: expense, surplus: income - expense,
      luxuryCount: luxury.length, campusCount: campusCount,
      luxuryAmount: sum(luxury, "expense"),
      topCategory: categories.length ? categories[0] : null
    };
  }
  function yearReport(year) {
    const list = records.filter(function (record) { return record.occurredAt.slice(0, 4) === year; });
    const income = sum(list, "income");
    const expense = sum(list, "expense");
    const luxury = list.filter(isLuxury);
    const months = {};
    list.forEach(function (record) {
      if (record.type !== "expense") return;
      const key = record.occurredAt.slice(0, 7);
      months[key] = (months[key] || 0) + record.amountCents;
    });
    const peakMonth = Object.keys(months).sort(function (a, b) { return months[b] - months[a]; })[0] || null;
    return {
      income: income, expense: expense, surplus: income - expense,
      luxuryCount: luxury.length, luxuryAmount: sum(luxury, "expense"),
      peakMonth: peakMonth, peakAmount: peakMonth ? months[peakMonth] : 0
    };
  }
  function syncReports() {
    const now = new Date();
    const currentMonth = monthKey(now);
    const currentYear = String(now.getFullYear());
    const recordedMonths = records.map(function (record) { return record.occurredAt.slice(0, 7); }).sort();
    const earliest = recordedMonths[0];
    if (earliest && earliest < settings.trackingStartMonth) {
      settings.trackingStartMonth = earliest;
      persistSettings();
    }
    const monthly = {};
    const yearly = {};
    let cursor = new Date(Number(settings.trackingStartMonth.slice(0, 4)), Number(settings.trackingStartMonth.slice(5)) - 1, 1);
    for (let count = 0; count < 600 && !Number.isNaN(cursor.getTime()); count++) {
      const key = monthKey(cursor);
      if (key > currentMonth || (key === currentMonth && !isMonthEnd(now))) break;
      monthly[key] = monthReport(key);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    const firstYear = Number(settings.trackingStartMonth.slice(0, 4));
    for (let year = firstYear; year <= Number(currentYear) && year < firstYear + 100; year++) {
      if (String(year) === currentYear && !isYearEnd(now)) break;
      yearly[String(year)] = yearReport(String(year));
    }
    reports = { monthly: monthly, yearly: yearly };
    try { if (!native) window.localStorage.setItem(REPORTS_KEY, JSON.stringify(reports)); } catch (error) {}
  }
  function reportSummaryCards(report) {
    return '<div class="report-summary-grid"><div><small>收入</small><strong>¥' + money(report.income) + '</strong></div>' +
      '<div><small>支出</small><strong>¥' + money(report.expense) + '</strong></div>' +
      '<div><small>盈余</small><strong class="' + (report.surplus < 0 ? 'negative' : 'positive') + '">' + signedMoney(report.surplus) + '</strong></div></div>';
  }
  function renderMonthlyReport(key, finalized) {
    const report = finalized ? reports.monthly[key] : monthReport(key);
    const luxury = sorted(records.filter(function (record) { return record.occurredAt.slice(0, 7) === key && isLuxury(record); }));
    const share = report.expense ? Math.round(report.luxuryAmount / report.expense * 100) : 0;
    const top = report.topCategory ? '支出最多的分类是' + escapeHtml(report.topCategory.name) + '，共 ¥' + money(report.topCategory.amount) + '。' : '本月还没有支出记录。';
    return '<section class="report-paper"><div class="report-paper-head"><span>' + (finalized ? '月度总结 · 已生成' : '月度总结 · 进行中预览') + '</span><h2>' + key.slice(0, 4) + ' 年 ' + Number(key.slice(5)) + ' 月</h2><p>' + top + '</p></div>' +
      reportSummaryCards(report) +
      '<div class="luxury-highlight"><span>本月奢侈消费</span><strong>¥' + money(report.luxuryAmount) + '</strong><p>共 ' + report.luxuryCount + ' 笔，占本月支出的 ' + share + '%</p></div>' +
      '<p class="rule-note">单笔支出超过 ¥50 标记为奢侈消费；备注提到“校园卡”的记录除外。本月排除 ' + report.campusCount + ' 笔。</p>' +
      '<div class="section-heading"><h2>奢侈消费明细</h2></div>' + entryList(luxury, '本月没有符合条件的奢侈消费。') +
      '</section>';
  }
  function renderYearlyReport(key, finalized) {
    const report = finalized ? reports.yearly[key] : yearReport(key);
    const peak = report.peakMonth ? '支出最高的是 ' + Number(report.peakMonth.slice(5)) + ' 月，支出 ¥' + money(report.peakAmount) + '。' : '目前还没有支出记录。';
    return '<section class="report-paper"><div class="report-paper-head"><span>' + (finalized ? '年度总结 · 已生成' : '年度总结 · 进行中预览') + '</span><h2>' + key + ' 年</h2><p>' + peak + '</p></div>' +
      reportSummaryCards(report) +
      '<div class="year-note"><span>全年奢侈消费</span><strong>' + report.luxuryCount + ' 笔 · ¥' + money(report.luxuryAmount) + '</strong></div>' +
      '<p class="rule-note">年度数据来自这一年已记录的收入与支出。年末最后一天生成正式总结。</p></section>';
  }
  function renderReports() {
    const monthly = state.reportTab === "monthly";
    const currentPeriod = monthly ? monthKey(new Date()) : String(new Date().getFullYear());
    const collection = monthly ? reports.monthly : reports.yearly;
    const periods = Array.from(new Set([currentPeriod].concat(Object.keys(collection)))).sort().reverse();
    const selected = periods.includes(state.reportPeriod) ? state.reportPeriod : periods[0];
    state.reportPeriod = selected;
    const finalized = Object.prototype.hasOwnProperty.call(collection, selected);
    const options = periods.map(function (key) {
      const label = monthly ? key.slice(0, 4) + '年' + Number(key.slice(5)) + '月' : key + '年';
      return '<option value="' + key + '"' + (selected === key ? ' selected' : '') + '>' + label + (collection[key] ? ' · 已生成' : ' · 预览') + '</option>';
    }).join('');
    return '<button type="button" class="back-link" data-action="back-me">‹ 返回我的</button>' +
      pageHeader('总结', 'REPORTS', '') +
      '<section class="report-intro"><span>自动生成</span><h2>每月回顾，年度回望。</h2><p>' + (native ? '月末和年末最后一天形成报告，晚上 9 点安排提醒。此后新增账单会更新报告；错过时下次打开补齐。' : '月末和年末最后一天自动形成报告；错过当天打开，也会在下次打开时补齐。') + '</p></section>' +
      '<div class="report-tabs"><button type="button" data-action="report-tab" data-tab="monthly" class="' + (monthly ? 'active' : '') + '">月度总结</button>' +
      '<button type="button" data-action="report-tab" data-tab="yearly" class="' + (!monthly ? 'active' : '') + '">年度总结</button></div>' +
      '<label class="report-period">查看期间<select id="reportPeriod">' + options + '</select></label>' +
      (monthly ? renderMonthlyReport(selected, finalized) : renderYearlyReport(selected, finalized));
  }
  function renderMe() {
    return pageHeader("我的", "SETTINGS", '<span class="header-badge">仅此设备</span>') +
      '<section class="profile-hero"><div class="profile-icon">◎</div><h2>你的私人账本</h2><p>记录日常，也留住对生活的掌控感。</p></section>' +
      '<div class="setting-list">' +
      '<button type="button" class="setting-row" data-action="go-assets"><span class="setting-icon assets">¥</span><span class="setting-copy"><strong>资产</strong><small>每月盈余与总资产</small></span><span class="setting-chevron">›</span></button>' +
      '<button type="button" class="setting-row" data-action="go-reports"><span class="setting-icon reports">▤</span><span class="setting-copy"><strong>总结</strong><small>月度与年度自动报告</small></span><span class="setting-chevron">›</span></button>' +
      (native ? '<button type="button" class="setting-row" data-action="notifications"><span class="setting-icon reports">♧</span><span class="setting-copy"><strong>总结提醒</strong><small>' + (native.notificationEnabled() ? '已开启 · 月末、年末晚上 9 点安排' : '未开启 · 点击允许通知') + '</small></span><span class="setting-chevron">›</span></button>' +
      '<button type="button" class="setting-row" data-action="quick-shortcut"><span class="setting-icon assets">＋</span><span class="setting-copy"><strong>快捷记账</strong><small>添加桌面入口，直接打开记账小窗口</small></span><span class="setting-chevron">›</span></button>' : '') +
      '<button type="button" class="setting-row" data-action="backup"><span class="setting-icon backup">▣</span><span class="setting-copy"><strong>数据备份</strong><small>保存完整 JSON 账本文件</small></span><span class="setting-chevron">›</span></button>' +
      '<button type="button" class="setting-row" data-action="tools"><span class="setting-icon transfer">⇅</span><span class="setting-copy"><strong>导入导出</strong><small>CSV 导出、CSV 导入、备份恢复</small></span><span class="setting-chevron">›</span></button>' +
      '</div><p class="storage-note">' + (native ? '账单仅保存在本机。卸载或清除应用数据会删除账本，请定期保存 JSON 备份。后台提醒可能受手机省电设置影响。' : '网页预览中的账单保存在当前浏览器。清除浏览器数据可能删除账单，请定期下载备份。') + '</p>';
  }
  function render() {
    document.querySelectorAll(".nav-item").forEach(function (button) {
      const activePage = state.page === "assets" || state.page === "reports" ? "me" : state.page;
      const active = button.dataset.page === activePage;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    view.innerHTML = state.page === "home" ? renderHome() : state.page === "bills" ? renderBills() : state.page === "stats" ? renderStats() : state.page === "assets" ? renderAssets() : state.page === "reports" ? renderReports() : renderMe();
  }
  function goPage(page) {
    state.page = page;
    if (page === "reports") syncReports();
    view.scrollTop = 0;
    render();
  }
  function shiftMonth(direction) {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + direction, 1);
    state.selectedDate = dateKey(state.month);
    render();
  }
  function fillCategoryOptions(selected) {
    const options = state.type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    const category = document.getElementById("category");
    category.innerHTML = options.map(function (name) { return '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>'; }).join("");
    category.value = options.includes(selected) ? selected : options[0];
  }
  function setEntryType(type, selectedCategory) {
    state.type = type;
    document.querySelectorAll(".type-option").forEach(function (button) { button.classList.toggle("active", button.dataset.type === type); });
    fillCategoryOptions(selectedCategory);
  }
  function openEntry(id) {
    const record = id ? records.find(function (item) { return item.id === id; }) : null;
    state.editingId = record ? record.id : null;
    entryForm.reset();
    document.getElementById("entryTitle").textContent = record ? "编辑账单" : "记一笔";
    document.getElementById("deleteEntry").hidden = !record;
    setEntryType(record ? record.type : "expense", record ? record.category : null);
    document.getElementById("amount").value = record ? (record.amountCents / 100).toFixed(2) : "";
    document.getElementById("occurredAt").value = record ? record.occurredAt : localInput(new Date());
    document.getElementById("note").value = record ? record.note : "";
    entryModal.hidden = false;
    setTimeout(function () { document.getElementById("amount").focus(); }, 40);
  }
  function closeEntry() { entryModal.hidden = true; state.editingId = null; }
  function closeTools() { toolsModal.hidden = true; }
  function download(name, content, type) {
    if (native) { native.exportFile(name, content, type); return; }
    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function backupJson() {
    const payload = { app: "money-manager-web", version: 2, exportedAt: new Date().toISOString(), entries: records, settings: settings };
    download("money-manager-backup-" + dateKey(new Date()) + ".json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    if (!native) showToast("JSON 备份已下载");
  }
  function csvCell(value) { return '"' + String(value).replace(/"/g, '""') + '"'; }
  function exportCsv() {
    const lines = ["date,type,amount,category,note"];
    sorted(records).forEach(function (record) {
      lines.push([
        csvCell(record.occurredAt),
        csvCell(record.type),
        csvCell((record.amountCents / 100).toFixed(2)),
        csvCell(record.category),
        csvCell(record.note)
      ].join(","));
    });
    download("money-manager-" + dateKey(new Date()) + ".csv", "\uFEFF" + lines.join("\r\n"), "text/csv;charset=utf-8");
    if (!native) showToast("CSV 账单已下载");
  }
  function parseCsv(text) {
    const source = text.replace(/^\uFEFF/, "");
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (quoted) {
        if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === ",") { row.push(cell); cell = ""; }
      else if (char === "\n") { row.push(cell.replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
      else cell += char;
    }
    if (quoted) throw new Error("CSV 引号未闭合");
    row.push(cell.replace(/\r$/, ""));
    if (row.some(Boolean)) rows.push(row);
    if (!rows.length || rows[0].join(",") !== "date,type,amount,category,note") throw new Error("CSV 表头不符合导出格式");
    return rows.slice(1).map(function (fields, index) {
      if (fields.length !== 5) throw new Error("第 " + (index + 2) + " 行字段数量不正确");
      const amount = String(fields[2]).trim();
      const type = fields[1] === "收入" ? "income" : fields[1] === "支出" ? "expense" : fields[1];
      const occurredAt = fields[0].trim().replace(" ", "T");
      if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error("第 " + (index + 2) + " 行金额不正确");
      const record = normalizeRecord({
        id: makeId(),
        type: type,
        amountCents: Math.round(Number(amount) * 100),
        category: fields[3],
        note: fields[4],
        occurredAt: occurredAt
      });
      if (!record) throw new Error("第 " + (index + 2) + " 行日期或类型不正确");
      return record;
    });
  }
  function importRecords(nextRecords, openingAssetCents, trackingStartMonth) {
    const restoresAsset = Number.isSafeInteger(openingAssetCents);
    const assetText = restoresAsset ? "，并恢复期初资产" : "";
    if (!window.confirm("将用 " + nextRecords.length + " 笔导入账单替换当前 " + records.length + " 笔账单" + assetText + "。确定继续吗？")) return;
    records = nextRecords;
    const earliestImported = nextRecords.length ? nextRecords.map(function (record) { return record.occurredAt.slice(0, 7); }).sort()[0] : null;
    settings.trackingStartMonth = trackingStartMonth || earliestImported || monthKey(new Date());
    if (restoresAsset) {
      settings.openingAssetCents = openingAssetCents;
    }
    if (!persist()) return;
    if (!native && !persistSettings()) return;
    syncReports();
    closeTools();
    state.month = new Date();
    state.month.setDate(1);
    state.selectedDate = dateKey(new Date());
    state.query = "";
    render();
    showToast("已导入 " + nextRecords.length + " 笔账单");
  }

  document.querySelectorAll(".nav-item").forEach(function (button) {
    button.addEventListener("click", function () { goPage(button.dataset.page); });
  });
  view.addEventListener("click", function (event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "add") openEntry();
    else if (action === "edit") openEntry(button.dataset.id);
    else if (action === "go-bills") goPage("bills");
    else if (action === "prev-month") shiftMonth(-1);
    else if (action === "next-month") shiftMonth(1);
    else if (action === "select-day") { state.selectedDate = button.dataset.date; render(); }
    else if (action === "clear-search") { state.query = ""; render(); document.getElementById("billSearch").focus(); }
    else if (action === "go-assets") goPage("assets");
    else if (action === "go-reports") { state.reportTab = "monthly"; state.reportPeriod = null; goPage("reports"); }
    else if (action === "back-me") goPage("me");
    else if (action === "report-tab") { state.reportTab = button.dataset.tab; state.reportPeriod = null; render(); }
    else if (action === "backup") backupJson();
    else if (action === "tools") toolsModal.hidden = false;
    else if (action === "notifications" && native) native.requestNotifications();
    else if (action === "quick-shortcut" && native) native.addShortcut();
  });
  view.addEventListener("input", function (event) {
    if (event.target.id !== "billSearch") return;
    state.query = event.target.value;
    document.getElementById("billDetail").innerHTML = billDetailHtml();
    document.getElementById("clearSearch").hidden = !state.query;
  });
  view.addEventListener("change", function (event) {
    if (event.target.id !== "reportPeriod") return;
    state.reportPeriod = event.target.value;
    render();
  });
  view.addEventListener("submit", function (event) {
    if (event.target.id !== "openingAssetForm") return;
    event.preventDefault();
    const value = document.getElementById("openingAsset").value.trim();
    if (!/^-?\d+(\.\d{1,2})?$/.test(value)) { showToast("期初资产最多保留两位小数"); return; }
    const cents = Math.round(Number(value) * 100);
    if (!Number.isSafeInteger(cents)) { showToast("期初资产金额过大"); return; }
    settings.openingAssetCents = cents;
    if (!persistSettings()) return;
    render();
    showToast("期初资产已保存");
  });
  document.querySelectorAll("[data-close-entry]").forEach(function (element) {
    element.addEventListener("click", closeEntry);
  });
  document.querySelectorAll("[data-close-tools]").forEach(function (element) {
    element.addEventListener("click", closeTools);
  });
  document.querySelectorAll(".type-option").forEach(function (button) {
    button.addEventListener("click", function () { setEntryType(button.dataset.type); });
  });
  document.getElementById("deleteEntry").addEventListener("click", function () {
    if (!state.editingId || !window.confirm("确定删除这笔账单吗？")) return;
    records = records.filter(function (record) { return record.id !== state.editingId; });
    if (!persist()) return;
    syncReports();
    closeEntry();
    render();
    showToast("账单已删除");
  });
  entryForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const rawAmount = document.getElementById("amount").value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(rawAmount) || Number(rawAmount) <= 0) { showToast("请输入大于零的金额，最多两位小数"); return; }
    const amountCents = Math.round(Number(rawAmount) * 100);
    const occurredAt = document.getElementById("occurredAt").value;
    const record = normalizeRecord({
      id: state.editingId || makeId(),
      type: state.type,
      amountCents: amountCents,
      category: document.getElementById("category").value,
      note: document.getElementById("note").value.trim(),
      occurredAt: occurredAt
    });
    if (!record) { showToast("请检查金额和日期时间"); return; }
    if (state.editingId) records = records.map(function (item) { return item.id === state.editingId ? record : item; });
    else records.push(record);
    state.month = new Date(occurredAt.slice(0, 4), Number(occurredAt.slice(5, 7)) - 1, 1);
    state.selectedDate = occurredAt.slice(0, 10);
    if (!persist()) return;
    syncReports();
    closeEntry();
    render();
    showToast("账单已保存");
  });
  document.querySelectorAll("[data-tool]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (button.dataset.tool === "export-csv") { exportCsv(); closeTools(); return; }
      state.importType = button.dataset.tool === "import-csv" ? "csv" : "json";
      if (native) { native.importFile(state.importType); return; }
      importFile.accept = state.importType === "csv" ? ".csv,text/csv" : ".json,application/json";
      importFile.value = "";
      importFile.click();
    });
  });
  function importText(text, type) {
    try {
      let nextRecords;
      let openingAssetCents;
      let trackingStartMonth;
      if (type === "json") {
        const parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
        if (!parsed || parsed.app !== "money-manager-web" || ![1, 2].includes(parsed.version) || !Array.isArray(parsed.entries)) throw new Error("不是本应用生成的 JSON 备份");
        nextRecords = parsed.entries.map(normalizeRecord);
        if (nextRecords.some(function (record) { return !record; })) throw new Error("备份中有无效账单");
        if (parsed.version === 2) {
          openingAssetCents = parsed.settings && parsed.settings.openingAssetCents;
          if (!Number.isSafeInteger(openingAssetCents)) throw new Error("备份中的期初资产无效");
          trackingStartMonth = parsed.settings && parsed.settings.trackingStartMonth;
          if (trackingStartMonth !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(trackingStartMonth)) throw new Error("备份中的记账起始月份无效");
        }
      } else {
        nextRecords = parseCsv(text);
      }
      importRecords(nextRecords, openingAssetCents, trackingStartMonth);
    } catch (error) {
      showToast(error.message || "导入失败，请检查文件");
    }
  }
  importFile.addEventListener("change", async function () {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    try { importText(await file.text(), state.importType); }
    catch (error) { showToast("文件读取失败"); }
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (!entryModal.hidden) closeEntry();
    else if (!toolsModal.hidden) closeTools();
  });

  function scheduleDayRefresh() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
    window.setTimeout(function () {
      syncReports();
      render();
      scheduleDayRefresh();
    }, Math.max(1000, next.getTime() - now.getTime()));
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    syncReports();
    render();
  });
  if (native) {
    document.querySelector(".tools-sheet > p").textContent = "把账单导出为 CSV，或从 CSV / JSON 文件恢复到这台手机。";
    document.querySelector(".tools-hint").textContent = "导入会替换当前账本，操作前请先保存备份。";
    window.MoneyManagerNative = {
      resume: function () { records = loadRecords(); settings = loadSettings(); syncReports(); render(); },
      report: function (data) {
        records = loadRecords(); settings = loadSettings(); syncReports();
        state.reportTab = data.kind === "yearly" ? "yearly" : "monthly";
        state.reportPeriod = data.period; goPage("reports");
      },
      importFile: function (data) { importText(data.text, data.type); },
      back: function () {
        if (!entryModal.hidden) { closeEntry(); return true; }
        if (!toolsModal.hidden) { closeTools(); return true; }
        if (state.page === "assets" || state.page === "reports") { goPage("me"); return true; }
        if (state.page !== "home") { goPage("home"); return true; }
        return false;
      }
    };
  }
  persistSettings();
  syncReports();
  render();
  scheduleDayRefresh();
})();
