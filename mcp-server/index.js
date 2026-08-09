const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { initDb, DB_PATH } = require('../db/db.js');
const {
  addTask,
  listTasks,
  setTaskStatus,
  setTaskTitle,
  deleteTask,
  setTaskTags,
  setTaskLinkedLists,
  listLists,
  createList,
  updateList,
  deleteList,
  listTags,
  createTag,
  listAuditLogs,
  restoreAuditLog,
} = require('./tasks.js');

const db = initDb(DB_PATH);
const server = new McpServer({ name: 'aido-tasks', version: '1.0.0' });

function isUniqueConstraintError(err) {
  return err && typeof err.message === 'string' && err.message.includes('UNIQUE constraint failed');
}

function normalizeTagNames(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );
}

function normalizeListIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = value.map((item) => Number(item));
  return Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
}

server.tool(
  'add_task',
  {
    title: z.string().describe('Title of the task to add'),
    listId: z.number().int().positive().optional().describe('Optional list ID, defaults to the Inbox list if omitted'),
    linkedListIds: z.array(z.number().int().positive()).optional().describe('Optional linked list IDs for cross-list visibility'),
    tags: z.array(z.string()).optional().describe('Optional tag names'),
  },
  async ({ title, listId, linkedListIds, tags }) => {
    if (listId !== undefined && listId !== null) {
      const targetList = listLists(db).find((list) => list.id === listId);
      if (targetList && targetList.kind === 'system') {
        return {
          content: [{ type: 'text', text: 'Cannot assign tasks directly to the reserved Today list' }],
          isError: true,
        };
      }
    }

    const normalizedTags = normalizeTagNames(tags ?? []);
    const normalizedLinkedListIds = normalizeListIds(linkedListIds ?? []);
    const task = addTask(db, title, listId ?? null, normalizedTags, normalizedLinkedListIds);
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  }
);

server.tool(
  'list_tasks',
  {
    listId: z.number().int().positive().describe('List ID to filter by (required — narrow the query, do not fetch every list)'),
    status: z.enum(['pending', 'in_progress', 'done']).describe('Status to filter by (required — narrow the query, do not fetch every status)'),
  },
  async ({ listId, status }) => {
    const tasks = listTasks(db, listId, status);
    return { content: [{ type: 'text', text: JSON.stringify(tasks) }] };
  }
);

server.tool(
  'complete_task',
  { id: z.number().int().positive().describe('ID of the task to mark done') },
  async ({ id }) => {
    const task = setTaskStatus(db, id, 'done');
    if (!task) {
      return { content: [{ type: 'text', text: `No task with id ${id}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  }
);

server.tool(
  'update_task_status',
  {
    id: z.number().int().positive().describe('ID of the task to update'),
    status: z.enum(['pending', 'in_progress', 'done']).describe('New task status'),
  },
  async ({ id, status }) => {
    const task = setTaskStatus(db, id, status);
    if (!task) {
      return { content: [{ type: 'text', text: `No task with id ${id}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  }
);

server.tool(
  'update_task_title',
  {
    id: z.number().int().positive().describe('ID of the task to update'),
    title: z.string().describe('New title'),
  },
  async ({ id, title }) => {
    const trimmed = title.trim();
    if (!trimmed) {
      return { content: [{ type: 'text', text: 'title must be a non-empty string' }], isError: true };
    }

    const task = setTaskTitle(db, id, trimmed);
    if (!task) {
      return { content: [{ type: 'text', text: `No task with id ${id}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  }
);

server.tool(
  'update_task_tags',
  {
    id: z.number().int().positive().describe('ID of the task to update'),
    tags: z.array(z.string()).describe('Full set of tag names to store for this task'),
  },
  async ({ id, tags }) => {
    const task = setTaskTags(db, id, normalizeTagNames(tags));
    if (!task) {
      return { content: [{ type: 'text', text: `No task with id ${id}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  }
);

server.tool(
  'update_task_linked_lists',
  {
    id: z.number().int().positive().describe('ID of the task to update'),
    linkedListIds: z.array(z.number().int().positive()).describe('Full set of linked list IDs'),
  },
  async ({ id, linkedListIds }) => {
    const validListIds = new Set(listLists(db).map((list) => list.id));
    const normalizedLinkedListIds = normalizeListIds(linkedListIds);
    const hasUnknownList = normalizedLinkedListIds.some((listId) => !validListIds.has(listId));
    if (hasUnknownList) {
      return { content: [{ type: 'text', text: 'One or more linked lists do not exist' }], isError: true };
    }

    const task = setTaskLinkedLists(db, id, normalizedLinkedListIds);
    if (!task) {
      return { content: [{ type: 'text', text: `No task with id ${id}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  }
);

server.tool(
  'delete_task',
  { id: z.number().int().positive().describe('ID of the task to delete') },
  async ({ id }) => {
    const deleted = deleteTask(db, id);
    if (!deleted) {
      return { content: [{ type: 'text', text: `No task with id ${id}` }], isError: true };
    }
    return { content: [{ type: 'text', text: `Deleted task ${id}` }] };
  }
);

server.tool('list_lists', 'List all task lists', async () => {
  const lists = listLists(db);
  return { content: [{ type: 'text', text: JSON.stringify(lists) }] };
});

server.tool('list_tags', 'List all tags', async () => {
  const tags = listTags(db);
  return { content: [{ type: 'text', text: JSON.stringify(tags) }] };
});

server.tool(
  'list_audit_logs',
  'List audit log entries, filtered by entity type and bounded to at most 50 results',
  {
    entityType: z
      .enum(['task', 'list', 'tag', 'audit_log'])
      .describe('Entity type to filter by (required — narrow the query, do not fetch every entry)'),
    limit: z.number().int().positive().max(50).describe('Maximum number of entries to return (required, max 50)'),
  },
  async ({ entityType, limit }) => {
    const logs = listAuditLogs(db, entityType, limit);
    return { content: [{ type: 'text', text: JSON.stringify(logs) }] };
  }
);

server.tool(
  'create_list',
  { name: z.string().describe('Name of the new list') },
  async ({ name }) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { content: [{ type: 'text', text: 'name must be a non-empty string' }], isError: true };
    }

    try {
      const list = createList(db, trimmed);
      return { content: [{ type: 'text', text: JSON.stringify(list) }] };
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return { content: [{ type: 'text', text: `A list named "${trimmed}" already exists` }], isError: true };
      }
      throw err;
    }
  }
);

server.tool(
  'create_tag',
  { name: z.string().describe('Name of the new tag') },
  async ({ name }) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { content: [{ type: 'text', text: 'name must be a non-empty string' }], isError: true };
    }

    try {
      const tag = createTag(db, trimmed);
      return { content: [{ type: 'text', text: JSON.stringify(tag) }] };
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return { content: [{ type: 'text', text: `A tag named "${trimmed}" already exists` }], isError: true };
      }
      throw err;
    }
  }
);

server.tool(
  'update_list',
  {
    id: z.number().int().positive().describe('ID of the list to rename'),
    name: z.string().describe('New list name'),
  },
  async ({ id, name }) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { content: [{ type: 'text', text: 'name must be a non-empty string' }], isError: true };
    }

    let list;
    try {
      list = updateList(db, id, trimmed);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return { content: [{ type: 'text', text: `A list named "${trimmed}" already exists` }], isError: true };
      }
      throw err;
    }

    if (!list) {
      return { content: [{ type: 'text', text: `No list with id ${id}` }], isError: true };
    }
    if (list.rejected) {
      return { content: [{ type: 'text', text: 'Cannot rename the reserved Today list' }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(list) }] };
  }
);

server.tool(
  'delete_list',
  { id: z.number().int().positive().describe('ID of the list to delete') },
  async ({ id }) => {
    const lists = listLists(db);
    if (lists.length <= 1) {
      return { content: [{ type: 'text', text: 'Cannot delete the last remaining list' }], isError: true };
    }

    const result = deleteList(db, id);
    if (!result.removedList) {
      if (result.reason === 'system list cannot be deleted') {
        return {
          content: [{ type: 'text', text: 'Cannot delete the reserved Today list' }],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: `No list with id ${id}` }], isError: true };
    }
    return { content: [{ type: 'text', text: `Deleted list ${id} and ${result.removedTasks} task(s)` }] };
  }
);

server.tool(
  'restore_audit_log',
  { id: z.number().int().positive().describe('Audit log ID to restore from') },
  async ({ id }) => {
    const restored = restoreAuditLog(db, id);
    if (!restored) {
      return { content: [{ type: 'text', text: `No audit log with id ${id}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(restored) }] };
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
