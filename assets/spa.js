import { initListView, initSearch, setListFilter } from './app.js';
import { initTaskView, showMissingTaskView } from './task.js';

const listNav = document.getElementById('list-navbar');
const taskNav = document.getElementById('task-navbar');
const listView = document.getElementById('list-view');
const taskView = document.getElementById('task-view');
const menuActive = document.getElementById('menu-view-active');
const menuCompleted = document.getElementById('menu-view-completed');

function isLocalNavigation(url) {
  return url.origin === window.location.origin
    && (url.pathname === '/' || url.pathname === '/index.php' || url.pathname === '/task.php');
}

function parseRoute(url) {
  const view = url.searchParams.get('view') === 'completed' ? 'completed' : 'active';
  if (url.pathname === '/task.php') {
    return { route: 'task', id: url.searchParams.get('id'), view };
  }
  return { route: 'list', view };
}

function updateMenuActive(view) {
  if (menuActive) {
    if (view === 'active') {
      menuActive.setAttribute('aria-current', 'page');
    } else {
      menuActive.removeAttribute('aria-current');
    }
  }
  if (menuCompleted) {
    if (view === 'completed') {
      menuCompleted.setAttribute('aria-current', 'page');
    } else {
      menuCompleted.removeAttribute('aria-current');
    }
  }
}

function showListView(view) {
  document.body.classList.add('route-list');
  document.body.classList.remove('route-task');
  if (listNav) listNav.removeAttribute('aria-hidden');
  if (taskNav) taskNav.setAttribute('aria-hidden', 'true');
  if (listView) listView.removeAttribute('aria-hidden');
  if (taskView) taskView.setAttribute('aria-hidden', 'true');
  setListFilter(view);
  updateMenuActive(view);
}

function showTaskView(controller, id) {
  document.body.classList.add('route-task');
  document.body.classList.remove('route-list');
  if (listNav) listNav.setAttribute('aria-hidden', 'true');
  if (taskNav) taskNav.removeAttribute('aria-hidden');
  if (listView) listView.setAttribute('aria-hidden', 'true');
  if (taskView) taskView.removeAttribute('aria-hidden');
  if (!id) {
    showMissingTaskView();
    return;
  }
  controller.loadTaskById(id).catch((error) => {
    console.error(error);
  });
}

function applyRoute(controller, url) {
  const route = parseRoute(url);
  if (route.route === 'task') {
    showTaskView(controller, route.id);
  } else {
    showListView(route.view);
  }
}

function navigate(controller, nextUrl, { replace = false } = {}) {
  const url = nextUrl instanceof URL ? nextUrl : new URL(nextUrl, window.location.origin);
  if (replace) {
    window.history.replaceState({}, '', url);
  } else {
    window.history.pushState({}, '', url);
  }
  applyRoute(controller, url);
}

function interceptNavigation(controller) {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a');
    if (!link) return;
    if (link.target && link.target !== '_self') return;
    if (link.hasAttribute('download')) return;
    const url = new URL(link.href, window.location.origin);
    if (!isLocalNavigation(url)) return;
    event.preventDefault();
    navigate(controller, url);
  });

  window.addEventListener('popstate', () => {
    applyRoute(controller, new URL(window.location.href));
  });
}

async function init() {
  await initListView();
  initSearch();
  let controller = null;
  controller = await initTaskView({
    onNavigateToList: () => navigate(controller, '/index.php'),
  });
  interceptNavigation(controller);
  applyRoute(controller, new URL(window.location.href));
}

init().catch((error) => {
  console.error(error);
});
