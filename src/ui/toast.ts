export function showToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration: number = 3500) {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full px-4 pointer-events-none';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto transform transition-all duration-300 ease-out translate-y-4 opacity-0 flex items-center gap-3 p-3.5 rounded-xl shadow-lg border text-sm font-medium ${
    type === 'success'
      ? 'bg-emerald-900/90 text-emerald-100 border-emerald-700 backdrop-blur-md'
      : type === 'error'
      ? 'bg-rose-900/90 text-rose-100 border-rose-700 backdrop-blur-md'
      : type === 'warning'
      ? 'bg-amber-900/90 text-amber-100 border-amber-700 backdrop-blur-md'
      : 'bg-slate-900/90 text-slate-100 border-slate-700 backdrop-blur-md'
  }`;

  const iconSvg =
    type === 'success'
      ? `<svg class="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`
      : type === 'error'
      ? `<svg class="w-5 h-5 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 9l-6 6M9 9l6 6"/></svg>`
      : type === 'warning'
      ? `<svg class="w-5 h-5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`
      : `<svg class="w-5 h-5 text-sky-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 16v-4m0-4h.01"/></svg>`;

  toast.innerHTML = `
    ${iconSvg}
    <div class="flex-1">${message}</div>
    <button class="text-slate-400 hover:text-white transition-colors p-1" onclick="this.parentElement.remove()">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  `;

  toastContainer.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  });

  // Auto dismiss
  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
