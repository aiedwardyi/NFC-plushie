export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

export function page(row, content, waving = false) {
  const title = escapeHtml(row?.pet_name || "new friend");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | plushie pet</title>
  <link rel="stylesheet" href="/style.css">
  <script src="/app.js" defer></script>
</head>
<body>
  <main>
    <p class="eyebrow">A little hello, just for you</p>
    <h1>${title}</h1>
    <div class="pet ${waving ? "waving" : "idle"}" role="img" aria-label="A friendly little pet${waving ? " waving hello" : " smiling"}">
      <div class="arm"></div><div class="blob"><span class="eyes"></span><span class="smile"></span></div>
    </div>
    ${content}
    <footer>A tiny tap. A familiar friend.</footer>
  </main>
</body>
</html>`;
}

export function petPage(row, code = null) {
  const greeting = row.pet_name ? `Hello again, ${escapeHtml(row.pet_name)}!` : "Hello! I'm so happy you found me.";
  const recovery = code ? `<aside class="recovery"><h2>Our little keep-safe code</h2>
    <p>Write this down, it is the only way to move me to a new phone.</p>
    <strong class="code">${escapeHtml(code)}</strong><p>This code is shown only now. Save it before naming me or leaving this page.</p></aside>` : "";
  const prompt = row.pet_name ? "" : `<form action="/name" method="post">
    <input type="hidden" name="uid" value="${escapeHtml(row.uid)}">
    <label for="name">What would you like to call me?</label>
    <input id="name" name="name" required maxlength="24" autocomplete="off" placeholder="A name for your friend">
    <button type="submit">That's your name!</button>
  </form>`;
  return page(row, `<p class="intro">${greeting}</p>${recovery}${prompt}<p class="count">${row.tap_count} happy ${row.tap_count === 1 ? "tap" : "taps"}</p>`, Boolean(code));
}

export function strangerPage(row, message = "") {
  return page(row, `<p class="intro">This little one already belongs to someone.</p>
    ${message ? `<p class="notice" role="alert">${escapeHtml(message)}</p>` : ""}
    <button type="button" id="claim-toggle" aria-expanded="${Boolean(message)}" aria-controls="claim-form">I own this</button>
    <form action="/claim" method="post" id="claim-form" ${message ? "" : "hidden"}>
      <input type="hidden" name="uid" value="${escapeHtml(row.uid)}">
      <label for="code">Your recovery code</label>
      <input id="code" name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="claim-help">
      <p id="claim-help">Enter the code you saved when you first met.</p>
      <button type="submit">Bring my friend home</button>
    </form>`);
}

export const fakeUids = ["04AAAAAAAAAAA1", "04BBBBBBBBBBB2", "04CCCCCCCCCCC3"];

export function devPage() {
  return page(null, `<p class="intro">Meet a practice plushie</p>
    <nav aria-label="Practice plushies">${fakeUids.map((uid, i) => `<a class="button" href="/t?uid=${uid}">Plushie ${String.fromCharCode(65 + i)} <small>${uid}</small></a>`).join("")}</nav>
    <form action="/dev/reset" method="post"><button class="secondary" type="submit">Reset all practice plushies</button></form>`);
}
