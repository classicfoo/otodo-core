(function initTaskDetailsModule() {
  function applyLineRules(value, rules) {
    if (!Array.isArray(rules) || rules.length === 0) return value;
    const lines = value.split('\n');
    const updated = lines.map((line) => {
      let nextLine = line;
      rules.forEach((rule) => {
        if (!rule || !rule.pattern) return;
        try {
          const flags = rule.flags || '';
          const regex = new RegExp(rule.pattern, flags);
          nextLine = nextLine.replace(regex, rule.replacement || '');
        } catch (error) {
          // Ignore invalid rules.
        }
      });
      return nextLine;
    });
    return updated.join('\n');
  }

  function normalizeDetails(value, config) {
    if (!value) return '';
    let normalized = value.replace(/\r\n/g, '\n').replace(/\s+$/g, '');
    const textExpanders = config.textExpanders || {};
    Object.entries(textExpanders).forEach(([trigger, replacement]) => {
      if (!trigger) return;
      normalized = normalized.split(trigger).join(String(replacement));
    });
    normalized = applyLineRules(normalized, config.lineRules);
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
