// Sudo Make Art is a native app (desktop via Electron, Android via Capacitor). Refuse to run in an ordinary browser.
(() => {
  const desktop = !!window.sma;                                   // exposed by electron/preload.js
  const android = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
    || (/Android/.test(navigator.userAgent) && /\bwv\b/.test(navigator.userAgent)); // Android WebView
  if (desktop || android) return;
  window.stop(); // stop the remaining scripts from loading
  document.body.textContent = '';
  const box = document.createElement('div'); box.className = 'native-only';
  const h = document.createElement('h1'); h.textContent = 'Sudo Make Art';
  const p = document.createElement('p'); p.textContent = 'This is a desktop and Android app, and it does not run in a web browser. Open it with the installed app: the AppImage on Linux, the installer or portable exe on Windows, or the APK on Android.';
  box.append(h, p); document.body.append(box);
})();
