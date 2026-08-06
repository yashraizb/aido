import { useState } from 'react';

export default function AddTaskInput({ onAdd }) {
  const [value, setValue] = useState('');
  const [tagsValue, setTagsValue] = useState('');

  function parseTags(input) {
    return Array.from(
      new Set(
        input
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      )
    );
  }

  async function submit() {
    const title = value.trim();
    if (!title) return;
    const tags = parseTags(tagsValue);

    setValue('');
    setTagsValue('');
    await onAdd(title, tags);
  }

  return (
    <div className="add-task-row">
      <span className="add-task-plus" aria-hidden="true">
        +
      </span>
      <input
        className="add-task-input"
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void submit();
          }
        }}
        onBlur={() => {
          void submit();
        }}
        placeholder="Add a task"
        aria-label="Add a task"
      />
      <input
        className="add-task-tags-input"
        type="text"
        value={tagsValue}
        onChange={(event) => setTagsValue(event.target.value)}
        placeholder="tags: work, urgent"
        aria-label="Task tags"
      />
    </div>
  );
}