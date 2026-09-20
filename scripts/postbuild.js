const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "out");
const notFoundFile = path.join(outDir, "404.html");

if (fs.existsSync(notFoundFile)) {
  let content = fs.readFileSync(notFoundFile, "utf8");
  const redirectScript = `
<script>
(function() {
  try {
    var path = window.location.pathname;
    var search = window.location.search || '';
    var hash = window.location.hash || '';
    var segments = path.split('/').filter(Boolean);
    var basePath = '';
    if (segments.length > 0 && segments[0] === 'creator-builder') {
      basePath = '/creator-builder';
      segments.shift();
    }
    if (segments.length === 0) {
      window.location.replace(basePath + '/builder');
      return;
    }
    if (segments[0] === 'builder') {
      if (segments.length === 1) {
        window.location.replace(basePath + '/builder');
        return;
      }
      var app = segments[1];
      if (app === 'editor') return;
      var tab = segments[2] || 'forms';
      var id = segments[3] || '';
      var q = '?app=' + encodeURIComponent(app);
      if (tab && tab !== 'forms') q += '&tab=' + encodeURIComponent(tab);
      if (tab === 'forms' && id) q += '&tab=forms&form=' + encodeURIComponent(id);
      else if (tab === 'reports' && id) q += '&tab=reports&report=' + encodeURIComponent(id);
      window.location.replace(basePath + '/builder/editor' + q + hash);
      return;
    }
    var appName = segments[0];
    if (appName === 'app') return;
    var q = '?app=' + encodeURIComponent(appName);
    if (segments[1] === 'reports' && segments[2]) {
      q += '&report=' + encodeURIComponent(segments[2]);
    } else if (segments[1] === 'pages' && segments[2]) {
      q += '&page=' + encodeURIComponent(segments[2]);
    } else if (segments[1]) {
      q += '&form=' + encodeURIComponent(segments[1]);
      if (segments[2] === 'new') q += '&action=new';
      else if (segments[2]) q += '&record=' + encodeURIComponent(segments[2]);
    }
    window.location.replace(basePath + '/app' + q + hash);
  } catch (e) {
    console.error("Postbuild SPA redirection error:", e);
  }
})();
</script>
`;

  if (content.includes("<head>")) {
    content = content.replace("<head>", "<head>" + redirectScript);
  } else {
    content = redirectScript + content;
  }
  fs.writeFileSync(notFoundFile, content, "utf8");
  console.log("✅ Successfully injected instant SPA redirection script into out/404.html");
} else {
  console.log("ℹ️ No out/404.html found to process (skip)");
}
