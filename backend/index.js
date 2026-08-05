const { initDb, DB_PATH } = require('../db/db.js');
const { createApp } = require('./server.js');

const db = initDb(DB_PATH);
const app = createApp(db);
const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
