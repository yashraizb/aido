const express = require('express');
const cors = require('cors');
const { listTasks } = require('../mcp-server/tasks.js');

function createApp(db) {
  const app = express();
  app.use(cors());

  app.get('/tasks', (req, res) => {
    res.json(listTasks(db));
  });

  return app;
}

module.exports = { createApp };
