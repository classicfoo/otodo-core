<?php
$taskFilter = $taskFilter ?? 'active';
$currentUser = $currentUser ?? null;
$isCompletedView = $taskFilter === 'completed';
?>
<nav class="app-nav">
  <div class="nav-row">
    <div class="nav-left">
      <a class="app-brand" href="/index.php">Otodo</a>
      <div class="status">
        <span id="offline-indicator" class="badge offline hidden">Offline</span>
        <span id="sync-indicator" class="badge sync hidden">0 pending</span>
      </div>
    </div>
    <div class="nav-actions">
      <button class="nav-icon" type="button" aria-label="Search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"></circle>
          <line x1="16.65" y1="16.65" x2="21" y2="21" stroke="currentColor" stroke-width="2"></line>
        </svg>
      </button>
      <button class="nav-icon" type="button" data-bs-toggle="offcanvas" data-bs-target="#mainMenu" aria-controls="mainMenu" aria-label="Open menu">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
          <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
          <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
        </svg>
      </button>
    </div>
  </div>
</nav>
<div class="offcanvas offcanvas-end" tabindex="-1" id="mainMenu" aria-labelledby="mainMenuLabel">
  <div class="offcanvas-header">
    <h5 class="offcanvas-title" id="mainMenuLabel">Menu</h5>
    <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
  </div>
  <div class="offcanvas-body">
    <div class="menu-panel">
      <p class="menu-greeting">
        Hello,
        <span id="menu-user-email" data-server-email="<?php echo $currentUser ? htmlspecialchars($currentUser['email'], ENT_QUOTES, 'UTF-8') : ''; ?>">
          <?php echo $currentUser ? htmlspecialchars($currentUser['email'], ENT_QUOTES, 'UTF-8') : 'Offline session'; ?>
        </span>
      </p>
      <div class="menu-card">
        <a class="menu-item" href="/index.php" data-bs-dismiss="offcanvas" <?php echo $isCompletedView ? '' : 'aria-current="page"'; ?>>Active tasks</a>
        <a class="menu-item" href="/index.php?view=completed" data-bs-dismiss="offcanvas" <?php echo $isCompletedView ? 'aria-current="page"' : ''; ?>>Completed tasks</a>
        <div class="menu-action">
          <button id="clear-cache-btn" type="button">Clear cache</button>
        </div>
        <form method="post" class="menu-action" data-offline-logout="true">
          <input type="hidden" name="action" value="logout">
          <button type="submit">Logout</button>
        </form>
      </div>
      <p class="menu-footer">All changes saved</p>
    </div>
  </div>
</div>
<div id="offline-banner" class="offline-banner hidden" role="status">Offline mode</div>
