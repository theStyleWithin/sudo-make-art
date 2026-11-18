// A small right-click menu used by the design editor and the video editor.
// SMA_CTX.show(x, y, [{ label, hint, fn, disabled }, 'sep', ...])
(function () {
  let menu = null;
  function close() { if (menu) { menu.remove(); menu = null; } }
  function show(x, y, items) {
    close(); menu = document.createElement('div'); menu.id = 'ctxmenu'; menu.setAttribute('role', 'menu');
    items.forEach(it => {
      if (it === 'sep') { menu.append(Object.assign(document.createElement('hr'))); return; }
      const b = document.createElement('button'); b.setAttribute('role', 'menuitem'); b.disabled = !!it.disabled; b.className = it.danger ? 'danger' : '';
      b.append(Object.assign(document.createElement('span'), { textContent: it.label }), Object.assign(document.createElement('kbd'), { textContent: it.hint || '' }));
      b.onclick = () => { close(); it.fn(); }; menu.append(b);
    });
    document.body.append(menu);
    const r = menu.getBoundingClientRect(); menu.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px'; menu.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
    const first = menu.querySelector('button:not(:disabled)'); if (first) first.focus();
  }
  document.addEventListener('pointerdown', ev => { if (menu && !menu.contains(ev.target)) close(); }, true);
  document.addEventListener('keydown', ev => { if (!menu) return; if (ev.key === 'Escape') { close(); ev.stopPropagation(); }
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); const b = [...menu.querySelectorAll('button:not(:disabled)')], i = b.indexOf(document.activeElement); b[(i + (ev.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length]?.focus(); } }, true);
  addEventListener('blur', close); addEventListener('resize', close); document.addEventListener('wheel', close, { passive: true });
  window.SMA_CTX = { show, close };
})();
