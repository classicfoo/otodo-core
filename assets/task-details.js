(function initTaskDetailsModule() {
  function normalizeDetails(value, config) {
    if (!value) return '';
    let normalized = value.replace(/\r\n/g, '\n').replace(/\s+$/g, '');
    const textExpanders = config.textExpanders || {};
    Object.entries(textExpanders).forEach(([trigger, replacement]) => {
      if (!trigger) return;
      normalized = normalized.split(trigger).join(String(replacement));
    });
    return normalized;
  }

  window.initTaskDetailsEditor = function initTaskDetailsEditor(config = {}) {
    const textarea = document.getElementById('edit-description');
    const preview = document.getElementById('edit-description-preview');
    const hiddenInput = document.getElementById('edit-description-normalized');

    if (preview && config.textColor) {
      preview.style.color = config.textColor;
    }

    function updateDetails() {
      if (!textarea) return '';
      const normalized = normalizeDetails(textarea.value, config);
      if (hiddenInput) {
        hiddenInput.value = normalized;
      }
      if (preview) {
        preview.textContent = normalized;
      }
      return normalized;
    }

    if (textarea) {
      textarea.addEventListener('input', updateDetails);
    }

    updateDetails();

    return {
      updateDetails,
    };
  };
})();
