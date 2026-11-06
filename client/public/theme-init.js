// Sets the theme before first paint (no flash of the wrong theme). Kept as an external, blocking script so the
// Content-Security-Policy can disallow inline scripts. Must stay tiny and dependency-free.
(function () {
  try {
    var saved = localStorage.getItem('cp-theme');
    var theme = saved === 'light' || saved === 'dark' ? saved : 'light';
    document.documentElement.dataset.theme = theme;
  } catch (e) { document.documentElement.dataset.theme = 'light'; }
})();
