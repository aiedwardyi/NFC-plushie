/* Sync boot: apply saved mascot before deferred app.js. Default horse. */
(function () {
  try {
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
