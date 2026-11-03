document.addEventListener('DOMContentLoaded', () => {
  // Year in footers
  document.querySelectorAll('[data-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });

  // Mobile sidebar toggle
  const toggle = document.querySelector('[data-menu-toggle]');
  const side = document.querySelector('.sidebar');
  toggle?.addEventListener('click', () => side?.classList.toggle('open'));

  // Close sidebar when clicking a nav link on mobile
  side?.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 720) side.classList.remove('open');
    });
  });

  // Demo forms
  document.querySelectorAll('.demo-form').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const msg = form.querySelector('.message');
      if (msg) msg.textContent = 'Demo only: this form is not connected to a server yet.';
    });
  });

  // Demo invite button
  document.querySelector('[data-demo-invite]')?.addEventListener('click', () => {
    alert('Invitations will work after authentication and email delivery are connected.');
  });

  // Review actions
  document.querySelectorAll('[data-review-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const msg = btn.closest('.panel')?.querySelector('.message');
      if (msg) {
        msg.textContent = btn.dataset.reviewAction === 'approve'
          ? 'Demo action: submission would be approved.'
          : 'Demo action: employee would be asked to correct and resubmit.';
      }
    });
  });

  // Report export demo
  document.querySelector('[data-demo-report]')?.addEventListener('click', () => {
    alert('Report export will be added after real data is connected.');
  });
});
