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
      <div class="status">
        <span id="offline-indicator" class="badge offline hidden">Offline</span>
        <span id="sync-indicator" class="badge sync hidden">0 pending</span>
      </div>
    </header>

    <section class="controls">
      <form id="add-form" autocomplete="off">
        <input id="title-input" name="title" type="text" placeholder="New task" required />
        <select id="priority-input" name="priority">
          <option value="low">Low</option>
          <option value="med">Med</option>
          <option value="high">High</option>
        </select>
        <label>
          Start
          <input id="start-input" name="start" type="date" />
        </label>
        <label>
          Due
          <input id="due-input" name="due" type="date" />
        </label>
        <button type="submit">Add</button>
      </form>
      <div class="tabs" role="tablist">
        <button type="button" class="tab active" data-filter="all">All</button>
        <button type="button" class="tab" data-filter="active">Active</button>
        <button type="button" class="tab" data-filter="completed">Completed</button>
      </div>
    </section>

    <section class="list">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Priority</th>
            <th>Start</th>
            <th>Due</th>
            <th>Done</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="task-body"></tbody>
      </table>
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
