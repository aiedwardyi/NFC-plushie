import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
import { talkFromEnv } from "./talk.js";

const db = openDatabase();
const port = process.env.PORT || 3000;
const talk = talkFromEnv(process.env, process.env.NODE_ENV === "production");
createApp({ db, talk }).listen(port, () => {
  console.log(`Plushie pet listening on http://localhost:${port}`);
});
