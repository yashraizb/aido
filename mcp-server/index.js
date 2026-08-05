const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { initDb, DB_PATH } = require('../db/db.js');
const { addTask, listTasks, completeTask } = require('./tasks.js');

const db = initDb(DB_PATH);

const server = new McpServer({ name: 'aido-tasks', version: '1.0.0' });

server.tool(
  'add_task',
  { title: z.string().describe('Title of the task to add') },
  async ({ title }) => {
    const task = addTask(db, title);
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  }
);

server.tool('list_tasks', 'List all tasks', async () => {
  const tasks = listTasks(db);
  return { content: [{ type: 'text', text: JSON.stringify(tasks) }] };
});

server.tool(
  'complete_task',
  { id: z.number().describe('ID of the task to mark done') },
  async ({ id }) => {
    const task = completeTask(db, id);
    if (!task) {
      return { content: [{ type: 'text', text: `No task with id ${id}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
