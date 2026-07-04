/* ============================================
   مُذاكِر — Notifications Manager
   ============================================ */

const Notif = (() => {

  const SESSION_LABELS = ['', 'الجلسة الأولى', 'الجلسة الثانية', 'الجلسة الثالثة', 'الجلسة الرابعة', 'الجلسة الخامسة'];
  const STORAGE_KEY = 'mudhaakir_scheduled_notifs';

  function getScheduled() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  }

  function saveScheduled(arr) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  }

  async function requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    const result = await Notification.requestPermission();
    return result;
  }

  function isSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  // Schedule a notification for a future time
  // We store them and check via setTimeout + persistence
  function schedule(topicName, sessionNum, dueAt) {
    if (!isSupported()) return;

    const delay = dueAt - Date.now();
    if (delay < 0) return; // already past

    const id = `${topicName}_${sessionNum}_${dueAt}`;
    const scheduled = getScheduled();

    // Avoid duplicates
    if (scheduled.find(n => n.id === id)) return;

    scheduled.push({ id, topicName, sessionNum, dueAt });
    saveScheduled(scheduled);

    // Set a live timeout if within 24 hours
    if (delay < 86400000) {
      setTimeout(() => fireNotification(topicName, sessionNum), delay);
    }
  }

  function fireNotification(topicName, sessionNum) {
    if (Notification.permission !== 'granted') return;

    const label = SESSION_LABELS[sessionNum] || `الجلسة ${sessionNum}`;
    new Notification(`مُذاكِر — حان وقت الاسترجاع 🧠`, {
      body: `${label}: "${topicName}" — افتح التطبيق الآن`,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: `mudhaakir_${topicName}_${sessionNum}`,
      requireInteraction: true,
      dir: 'rtl',
      lang: 'ar',
    });

    // Remove from scheduled
    const scheduled = getScheduled().filter(n => !(n.topicName === topicName && n.sessionNum === sessionNum));
    saveScheduled(scheduled);
  }

  // On app load: check for any pending notifications that fired while app was closed
  function checkPending() {
    if (!isSupported() || Notification.permission !== 'granted') return;

    const scheduled = getScheduled();
    const now = Date.now();
    const remaining = [];

    scheduled.forEach(n => {
      if (n.dueAt <= now) {
        // Fire missed notification
        fireNotification(n.topicName, n.sessionNum);
      } else {
        remaining.push(n);
        // Re-register timeout if within 24h
        const delay = n.dueAt - now;
        if (delay < 86400000) {
          setTimeout(() => fireNotification(n.topicName, n.sessionNum), delay);
        }
      }
    });

    saveScheduled(remaining);
  }

  // Auto-check on load
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(checkPending, 1000);
  });

  return { requestPermission, schedule, fireNotification, checkPending, isSupported };

})();
