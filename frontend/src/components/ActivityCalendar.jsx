function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function buildCalendarWeeks(referenceDate) {
  const end = startOfUtcDay(referenceDate);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);

  const startDay = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - startDay);

  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

function levelForCount(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

export default function ActivityCalendar({ completedTasks }) {
  const countsByDate = {};
  for (const task of completedTasks) {
    if (!task.updated_at) continue;
    const key = task.updated_at.slice(0, 10);
    countsByDate[key] = (countsByDate[key] || 0) + 1;
  }

  const weeks = buildCalendarWeeks(new Date());

  return (
    <div className="activity-calendar" aria-label="Task completion activity, last 12 months">
      <div className="activity-calendar-grid">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="activity-calendar-week">
            {week.map((day) => {
              const key = day.toISOString().slice(0, 10);
              const count = countsByDate[key] || 0;
              const level = levelForCount(count);
              const label = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
              const countLabel = count === 1 ? '1 task completed' : `${count} tasks completed`;

              return (
                <div
                  key={key}
                  className={`activity-calendar-day activity-calendar-level-${level}`}
                  title={`${countLabel} on ${label}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
