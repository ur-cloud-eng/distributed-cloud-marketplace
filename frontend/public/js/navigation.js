const trigger = document.querySelector('.menu-button');
const drawer = document.querySelector('#portal-menu');
if (trigger && drawer) {
  trigger.hidden = false;
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', () => {
    drawer.showModal();
    trigger.setAttribute('aria-expanded', 'true');
  });
  drawer.addEventListener('close', () => trigger.setAttribute('aria-expanded', 'false'));
  window.matchMedia('(max-width: 1100px)').addEventListener('change', ({ matches }) => {
    if (!matches && drawer.open) drawer.close();
  });
}
for (const opener of document.querySelectorAll('[data-open]')) {
  opener.hidden = false;
  opener.addEventListener('click', () => document.getElementById(opener.dataset.open).showModal());
}
for (const closer of document.querySelectorAll('[data-close]')) {
  closer.addEventListener('click', () => closer.closest('dialog').close());
}
for (const tabs of document.querySelectorAll('[data-tabs]')) {
  const links = [...tabs.querySelectorAll('[data-tab]')];
  const requested = new URLSearchParams(location.search).get('tab');
  const key = links.some(link => link.dataset.tab === requested) ? requested : links[0].dataset.tab;
  for (const link of links) {
    if (link.dataset.tab === key) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  for (const panel of document.querySelectorAll('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== key;
  }
}
for (const form of document.querySelectorAll('[data-filter-form]')) {
  const params = new URLSearchParams(location.search);
  for (const input of form.elements) {
    if (input.name && params.has(input.name)) input.value = params.get(input.name);
  }
  if ([...params.keys()].some(key => key !== 'tab')) {
    form.nextElementSibling.textContent = 'Filters selected. Results require the existing backend.';
  }
  form.addEventListener('reset', () => location.assign(location.pathname));
}

