/* Sync boot: apply saved mascot and sky band before deferred app.js. Default horse. */
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
    var kind = "horse";
    var q = new URLSearchParams(location.search).get("mascot");
    if (q === "sheep" || q === "horse") kind = q;
    else {
      try {
        var ls = localStorage.getItem(KEY);
        if (ls === "sheep" || ls === "horse") kind = ls;
      } catch (e) {}
      if (kind === "horse") {
        var m = document.cookie.match(/(?:^|; )mascot=(sheep|horse)(?:;|$)/);
        if (m) kind = m[1];
      }
    }
    document.documentElement.setAttribute("data-mascot", kind);
    if (kind !== "sheep") return;
    var imgs = document.querySelectorAll("img.pet-frame");
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute("src") || "";
      if (src.indexOf("mascot-horse") !== -1) {
        imgs[i].setAttribute("src", src.split("mascot-horse").join("mascot-sheep"));
      }
    }
    var btns = document.querySelectorAll(".mascot-tog");
    for (var j = 0; j < btns.length; j++) {
      var on = btns[j].getAttribute("data-mascot") === kind;
      btns[j].classList.toggle("is-active", on);
      btns[j].setAttribute("aria-pressed", on ? "true" : "false");
    }
  } catch (e) {}
})();
