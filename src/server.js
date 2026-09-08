import { createApp } from "./app.js";
import { openDatabase } from "./db.js";

const db = openDatabase();
const port = process.env.PORT || 3000;
createApp({ db }).listen(port, () => {
  console.log(`Plushie pet listening on http://localhost:${port}`);
});
