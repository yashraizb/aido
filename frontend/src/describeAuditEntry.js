function describeCreateTask(entry) {
  return `Created task "${entry.details.title}"`;
}

function describeSetTaskStatus(entry) {
  return `Marked task #${entry.entity_id} as ${entry.details.status}`;
}

function describeSetTaskTitle(entry) {
  return `Renamed task #${entry.entity_id} to "${entry.details.title}"`;
}

function describeDeleteTask(entry) {
  const title = entry.details && entry.details.title;
  return title ? `Deleted task "${title}"` : `Deleted task #${entry.entity_id}`;
}

function describeSetTaskTags(entry) {
  const tagNames = Array.isArray(entry.details.tagNames) ? entry.details.tagNames : [];
  return tagNames.length > 0
    ? `Set tags on task #${entry.entity_id} to: ${tagNames.join(', ')}`
    : `Cleared tags on task #${entry.entity_id}`;
}

function describeSetTaskLinkedLists(entry) {
  return `Updated linked lists for task #${entry.entity_id}`;
}

function describeCreateList(entry) {
  return `Created list "${entry.details.name}"`;
}

function describeUpdateList(entry) {
  return `Renamed list #${entry.entity_id} to "${entry.details.name}"`;
}

function describeDeleteList(entry) {
  const name = entry.details && entry.details.list && entry.details.list.name;
  const removedTasks = entry.details && entry.details.removedTasks;
  const label = name ? `"${name}"` : `#${entry.entity_id}`;
  return `Deleted list ${label}${removedTasks ? ` (${removedTasks} task${removedTasks === 1 ? '' : 's'} removed)` : ''}`;
}

function describeCreateTag(entry) {
  return `Created tag "${entry.details.name}"`;
}

function describeRestoreAuditLog(entry) {
  return `Restored to a previous state (from entry #${entry.details.restoredFromAuditId})`;
}

const DESCRIBERS = {
  create_task: describeCreateTask,
  set_task_status: describeSetTaskStatus,
  set_task_title: describeSetTaskTitle,
  delete_task: describeDeleteTask,
  set_task_tags: describeSetTaskTags,
  set_task_linked_lists: describeSetTaskLinkedLists,
  create_list: describeCreateList,
  update_list: describeUpdateList,
  delete_list: describeDeleteList,
  create_tag: describeCreateTag,
  restore_audit_log: describeRestoreAuditLog,
};

export function describeAuditEntry(entry) {
  const describer = DESCRIBERS[entry.action];
  if (!describer) return `${entry.action} (${entry.entity_type} #${entry.entity_id})`;

  try {
    return describer(entry);
  } catch {
    return `${entry.action} (${entry.entity_type} #${entry.entity_id})`;
  }
}
