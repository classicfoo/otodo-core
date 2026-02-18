<?php
declare(strict_types=1);

require __DIR__ . '/auth.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'logout') {
    handle_logout($db);
    header('Location: login.php');
    exit;
}

$currentUser = current_user();
if (!$currentUser) {
    header('Location: login.php');
    exit;
}

$errors = [];
$successMessage = '';
$lineRules = get_user_line_rules($db, (int)$currentUser['id']);
$dateFormats = get_user_date_formats($db, (int)$currentUser['id']);
$dateColor = get_user_date_color($db, (int)$currentUser['id']);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_line_rules') {
    $rawRules = json_decode((string)($_POST['line_rules_json'] ?? '[]'), true);
    if (!is_array($rawRules)) {
        $rawRules = [];
    }
    $sanitized = sanitize_line_rules($rawRules);
    $dateFormatsInput = (string)($_POST['date_formats'] ?? '');
    $dateFormatsSanitized = sanitize_date_formats_input($dateFormatsInput);
    $dateColorInput = (string)($_POST['date_color'] ?? '#FDA90D');

    $savedRules = save_user_line_rules($db, (int)$currentUser['id'], $sanitized);
    $savedFormats = save_user_date_formats($db, (int)$currentUser['id'], $dateFormatsSanitized);
    $savedDateColor = save_user_date_color($db, (int)$currentUser['id'], $dateColorInput);

    if (!$savedRules || !$savedFormats || !$savedDateColor) {
        $errors[] = 'Unable to save editor settings. Please try again.';
    } else {
        $lineRules = get_user_line_rules($db, (int)$currentUser['id']);
        $dateFormats = get_user_date_formats($db, (int)$currentUser['id']);
        $dateColor = get_user_date_color($db, (int)$currentUser['id']);
        $successMessage = 'Editor settings saved.';
    }
}

$pageTitle = 'Settings';
$pageHeading = 'Editor Settings';
$pageHint = 'Customize how prefixed lines are highlighted in the task description editor.';
$lineRulesJson = json_encode($lineRules, JSON_UNESCAPED_SLASHES);

include __DIR__ . '/auth_header.php';
?>

<?php if ($successMessage !== ''): ?>
  <div class="alert alert-success" role="alert">
    <?php echo htmlspecialchars($successMessage, ENT_QUOTES, 'UTF-8'); ?>
  </div>
<?php endif; ?>

<?php if ($errors): ?>
  <div class="alert alert-danger" role="alert">
    <ul class="mb-0">
      <?php foreach ($errors as $error): ?>
        <li><?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?></li>
      <?php endforeach; ?>
    </ul>
  </div>
<?php endif; ?>

<section class="surface">
  <h2 class="h5">Editor settings</h2>
  <p class="hint">Configure line highlighting rules and date detection in the task description editor.</p>
  <form method="post" id="line-rules-form" class="d-grid gap-3">
    <input type="hidden" name="action" value="save_line_rules">
    <div>
      <label class="form-label" for="date_color">Date highlight color</label>
      <input type="color" class="form-control form-control-color" id="date_color" name="date_color" value="<?php echo htmlspecialchars($dateColor, ENT_QUOTES, 'UTF-8'); ?>">
    </div>
    <div>
      <label class="form-label" for="date_formats">Date formats to highlight</label>
      <textarea class="form-control" id="date_formats" name="date_formats" rows="4" placeholder="DD MMM YYYY&#10;DD/MM/YYYY"><?php echo htmlspecialchars(implode("\n", $dateFormats), ENT_QUOTES, 'UTF-8'); ?></textarea>
      <p class="hint mb-0 mt-1">One format per line. Supported tokens: D, DD, M, MM, MMM, MMMM, YY, YYYY.</p>
    </div>
    <div>
      <label class="form-label">Custom line rules</label>
      <p class="hint mb-1">Rules apply when a line begins with the exact prefix. Example: a prefix of <code>T </code> highlights task lines.</p>
    </div>
    <input type="hidden" id="line_rules_json" name="line_rules_json" value="<?php echo htmlspecialchars($lineRulesJson ?: '[]', ENT_QUOTES, 'UTF-8'); ?>">
    <div id="line-rules-container" class="d-grid gap-2"></div>
    <div class="d-flex flex-wrap gap-2">
      <button type="button" class="btn btn-outline-dark" id="add-rule-btn">Add rule</button>
      <button type="submit" class="btn btn-neutral">Save</button>
      <a href="/index.php" class="btn btn-outline-secondary">Back</a>
    </div>
  </form>
</section>

<script>
(() => {
  const container = document.getElementById('line-rules-container');
  const hiddenInput = document.getElementById('line_rules_json');
  const addButton = document.getElementById('add-rule-btn');
  const form = document.getElementById('line-rules-form');

  if (!container || !hiddenInput || !addButton || !form) return;

  const defaults = [
    { prefix: 'T ', label: 'Task', color: '#1D4ED8', className: 'code-line-task' },
    { prefix: 'N ', label: 'Note', color: '#1E7A3E', className: 'code-line-note' },
    { prefix: 'M ', label: 'Milestone', color: '#800000', className: 'code-line-milestone' },
    { prefix: '# ', label: 'Heading', color: '#212529', className: 'code-line-heading', weight: '700' },
    { prefix: 'X ', label: 'Done', color: '#6C757D', className: 'code-line-done' }
  ];

  function sanitizeRule(rule) {
    if (!rule || typeof rule !== 'object') return null;
    const prefix = String(rule.prefix || '');
    if (!prefix.trim()) return null;
    const label = String(rule.label || '').trim();
    const color = String(rule.color || '').trim().toUpperCase();
    const weight = String(rule.weight || '').trim();
    const className = String(rule.className || '').trim();
    const out = { prefix };
    if (label) out.label = label;
    if (/^#[0-9A-F]{6}$/.test(color)) out.color = color;
    if (weight === '400' || weight === '700') out.weight = weight;
    if (/^[A-Za-z0-9_-]+$/.test(className)) out.className = className;
    return out;
  }

  function readRows() {
    return Array.from(container.querySelectorAll('[data-rule-row]'))
      .map((row) => {
        const prefix = row.querySelector('[data-field="prefix"]');
        const label = row.querySelector('[data-field="label"]');
        const color = row.querySelector('[data-field="color"]');
        const weight = row.querySelector('[data-field="weight"]');
        const className = row.querySelector('[data-field="className"]');
        return sanitizeRule({
          prefix: prefix ? prefix.value : '',
          label: label ? label.value : '',
          color: color ? color.value : '',
          weight: weight ? weight.value : '',
          className: className ? className.value : ''
        });
      })
      .filter(Boolean)
      .slice(0, 25);
  }

  function syncHidden() {
    hiddenInput.value = JSON.stringify(readRows());
  }

  function rowTemplate(rule = {}) {
    const row = document.createElement('div');
    row.dataset.ruleRow = '1';
    row.className = 'border rounded p-2';
    row.innerHTML = `
      <div class="row g-2 align-items-end">
        <div class="col-md-2">
          <label class="form-label small mb-1">Prefix</label>
          <input type="text" class="form-control form-control-sm" data-field="prefix" value="${String(rule.prefix || '').replace(/"/g, '&quot;')}" placeholder="T ">
        </div>
        <div class="col-md-3">
          <label class="form-label small mb-1">Label</label>
          <input type="text" class="form-control form-control-sm" data-field="label" value="${String(rule.label || '').replace(/"/g, '&quot;')}" placeholder="Task">
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-1">Color</label>
          <input type="color" class="form-control form-control-color form-control-sm" data-field="color" value="${String(rule.color || '#1D4ED8').replace(/"/g, '&quot;')}">
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-1">Weight</label>
          <select class="form-select form-select-sm" data-field="weight">
            <option value="">Default</option>
            <option value="400" ${rule.weight === '400' ? 'selected' : ''}>Normal</option>
            <option value="700" ${rule.weight === '700' ? 'selected' : ''}>Bold</option>
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-1">Class</label>
          <input type="text" class="form-control form-control-sm" data-field="className" value="${String(rule.className || '').replace(/"/g, '&quot;')}" placeholder="code-line-task">
        </div>
        <div class="col-md-1 d-grid">
          <button type="button" class="btn btn-outline-danger btn-sm" data-remove-rule>&times;</button>
        </div>
      </div>
    `;
    row.querySelectorAll('input, select').forEach((input) => {
      input.addEventListener('input', syncHidden);
      input.addEventListener('change', syncHidden);
    });
    const removeBtn = row.querySelector('[data-remove-rule]');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        row.remove();
        syncHidden();
      });
    }
    return row;
  }

  let initial;
  try {
    initial = JSON.parse(hiddenInput.value || '[]');
  } catch (error) {
    initial = [];
  }
  if (!Array.isArray(initial) || initial.length === 0) {
    initial = defaults;
  }
  initial.slice(0, 25).forEach((rule) => container.appendChild(rowTemplate(rule)));
  syncHidden();

  addButton.addEventListener('click', () => {
    if (container.querySelectorAll('[data-rule-row]').length >= 25) {
      return;
    }
    container.appendChild(rowTemplate({ prefix: '' }));
    syncHidden();
  });

  form.addEventListener('submit', syncHidden);
})();
</script>

<?php include __DIR__ . '/auth_footer.php'; ?>
