<?php
declare(strict_types=1);

session_start();

if (!isset($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
$csrfToken = $_SESSION['csrf_token'];
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="csrf-token" content="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES); ?>" />
  <title>Otodo</title>
  <link rel="stylesheet" href="/assets/styles.css" />
</head>
<body>
  <div class="app">
    <header class="topbar">
      <h1>Otodo</h1>
      <div class="topbar-actions">
        <button class="icon-button" type="button" aria-label="Search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="M20 20l-3.5-3.5"></path>
          </svg>
        </button>
        <button class="icon-button" type="button" aria-label="Menu">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16"></path>
          </svg>
        </button>
        <div class="status">
          <span id="offline-indicator" class="badge offline hidden">Offline</span>
          <span id="sync-indicator" class="badge sync hidden">0 pending</span>
        </div>
      </div>
    </header>

    <section class="controls">
      <form id="add-form" autocomplete="off">
        <div class="input-group">
          <input id="title-input" name="title" type="text" placeholder="New task" required />
          <button type="submit">Add</button>
        </div>
        <div class="field-row">
          <label class="hidden-field">
            Priority
            <select id="priority-input" name="priority">
              <option value="low">Low</option>
              <option value="med">Med</option>
              <option value="high">High</option>
            </select>
          </label>
          <label class="hidden-field">
            Start
            <input id="start-input" name="start" type="date" />
          </label>
          <label class="hidden-field">
            Due
            <input id="due-input" name="due" type="date" />
          </label>
        </div>
      </form>
      <div class="tabs" role="tablist">
        <button type="button" class="tab active" data-filter="all">All</button>
        <button type="button" class="tab" data-filter="active">Active</button>
        <button type="button" class="tab" data-filter="completed">Completed</button>
      </div>
    </section>

    <section class="list">
      <div id="task-body" class="task-list"></div>
      <p id="empty-state" class="empty">No tasks yet.</p>
    </section>
  </div>

  <div id="toast" class="toast hidden"></div>

  <script>
    window.OTODO_CSRF = "<?php echo htmlspecialchars($csrfToken, ENT_QUOTES); ?>";
  </script>
  <script type="module" src="/assets/app.js"></script>
</body>
</html>
