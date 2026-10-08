/* Sync boot: apply saved mascot and sky band before deferred app.js. Default: the server's kind. */
(function () {
  try {
    // Script-inserted, so it never blocks first paint.
    var font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";
    document.head.appendChild(font);
    if (document.documentElement.getAttribute("data-theme") === "najeon") {
      ["400", "700"].forEach(function (w) {
        var face = document.createElement("link");
        face.rel = "stylesheet";
        face.href = "https://cdn.jsdelivr.net/npm/@fontsource/gowun-batang@5.3.0/" + w + ".css";
        document.head.appendChild(face);
      });
    }
  } catch (e) {}
  try {
    // The wake hides the name form and recovery code, so only while app.js runs to bring them back.
    var root = document.documentElement;
    root.classList.add("has-app");
    document.addEventListener("DOMContentLoaded", function () {
      if (!root.hasAttribute("data-app")) root.classList.remove("has-app");
    });
  } catch (e) {}
  try {
    var h = new Date().getHours();
    document.documentElement.setAttribute("data-time", h >= 5 && h < 11 ? "morning" : h >= 11 && h < 18 ? "day" : h >= 18 && h < 22 ? "evening" : "night");
    var KEY = "pokkey-mascot";
    // The kinds a browser can keep as its own are listed on this script's own tag.
    var kinds = ((document.currentScript && document.currentScript.getAttribute("data-mascots")) || "").split(" ");
    var base = document.documentElement.getAttribute("data-mascot");
    var kind = base;
    var saved = document.querySelector('meta[name="pet-kind"]');
    if (saved) {
      document.documentElement.setAttribute("data-mascot", saved.content);
      return;
    }
    var q = new URLSearchParams(location.search).get("mascot");
    if (kinds.indexOf(q) !== -1) kind = q;
    else {
      try {
        var ls = localStorage.getItem(KEY);
        if (kinds.indexOf(ls) !== -1) kind = ls;
      } catch (e) {}
      if (kind === base) {
        var m = document.cookie.match(/(?:^|; )mascot=([a-z]+)(?:;|$)/);
        if (m && kinds.indexOf(m[1]) !== -1) kind = m[1];
      }
    }
    document.documentElement.setAttribute("data-mascot", kind);
    if (kind === base) return;
    var swap = function () {
      var imgs = document.querySelectorAll("img.pet-frame");
      for (var i = 0; i < imgs.length; i++) {
        var src = imgs[i].getAttribute("src") || "";
        if (src.indexOf("mascot-" + base) !== -1) {
          imgs[i].setAttribute("src", src.split("mascot-" + base).join("mascot-" + kind));
        }
      }
    };
    swap();
    // The pet comes after this script, so swap its frames as the parser adds them, before the first paint.
    var parsing = new MutationObserver(swap);
    parsing.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", function () { parsing.disconnect(); });
  } catch (e) {}
})();
