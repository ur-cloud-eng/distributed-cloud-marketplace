function isNetworkCidr(value) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(value);
  if (!match) return false;
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (prefix > 32 || octets.some(octet => octet > 255)) return false;
  const address = octets.reduce((total, octet) => total * 256 + octet, 0);
  return address % (2 ** (32 - prefix)) === 0;
}
for (const form of document.querySelectorAll('[data-local-form]')) {
  const fields = form.querySelector('[data-form-fields]');
  const feedback = form.querySelector('.form-feedback');
  const inputs = [...form.querySelectorAll('input, select')];
  form.noValidate = true;
  function validate(input) {
    if (input.disabled) return true;
    let message = '';
    const value = input.value.trim();
    if (input.type === 'radio') {
      if (!inputs.some(item => item.name === input.name && item.checked)) message = 'Choose an option.';
    } else if (input.required && !value) message = 'This field is required.';
    else if (input.validity.typeMismatch) message = 'Enter a valid email address.';
    else if (input.type === 'number' && (!Number.isInteger(Number(value)) || Number(value) < Number(input.min))) message = 'Enter a whole number of at least ' + input.min + '.';
    else if (input.dataset.rule === 'resource-name' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) message = 'Use lowercase letters, numbers and single hyphens between words.';
    else if (input.dataset.rule === 'group-name' && !/^[a-zA-Z0-9][a-zA-Z0-9 -]{2,63}$/.test(value)) message = 'Use 3–64 letters, numbers, spaces or hyphens.';
    else if (input.dataset.rule === 'cidr' && !isNetworkCidr(value)) message = 'Enter a valid IPv4 network address and prefix, such as 10.0.0.0/16.';
    else if (input.dataset.rule === 'totp' && !/^\d{6}$/.test(value)) message = 'Enter exactly six digits.';
    else if (input.dataset.rule === 'confirmation' && input.value !== form.elements.password.value) message = 'Passwords do not match.';
    const error = document.getElementById('field-' + input.name + '-error');
    if (error) error.textContent = message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    return !message;
  }
  function updateReview(input) {
    if (['password', 'confirmPassword', 'code'].includes(input.name)) return;
    const target = document.querySelector('[data-review="' + input.name + '"]');
    if (target) target.textContent = input.value.trim() || '—';
  }
  for (const input of inputs) {
    input.addEventListener('input', () => {
      if (input.hasAttribute('aria-invalid')) validate(input);
      if (input.name === 'password' && form.elements.confirmPassword?.value) validate(form.elements.confirmPassword);
      updateReview(input);
      if (feedback) feedback.textContent = '';
    });
    input.addEventListener('change', () => {
      if (input.type === 'radio') {
        for (const item of inputs.filter(item => item.name === input.name)) validate(item);
      }
      updateReview(input);
    });
  }
  for (const toggle of form.querySelectorAll('[data-toggle]')) {
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      const input = document.getElementById(toggle.dataset.toggle);
      input.type = input.type === 'password' ? 'text' : 'password';
      toggle.textContent = input.type === 'password' ? 'Show' : 'Hide';
      toggle.setAttribute('aria-label', toggle.textContent + ' ' + input.labels[0].textContent.toLowerCase());
    });
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const invalid = inputs.filter(input => !validate(input));
    if (invalid.length) {
      invalid[0].focus();
      return;
    }
    if (feedback) feedback.textContent = 'Local checks passed. This action still requires the existing backend.';
  });
  fields.disabled = false;
}

