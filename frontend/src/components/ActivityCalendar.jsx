import { useState } from 'react';

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function buildYearWeeks(year, today) {
  const currentYear = today.getUTCFullYear();
  const rangeEnd = year === currentYear ? today : new Date(Date.UTC(year, 11, 31));
  const rangeStart = new Date(Date.UTC(year, 0, 1));

  const start = new Date(rangeStart);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const end = new Date(rangeEnd);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));

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

function yearsWithData(completedTasks, currentYear) {
  const years = new Set([currentYear]);
  for (const task of completedTasks) {
    if (!task.updated_at) continue;
    years.add(Number(task.updated_at.slice(0, 4)));
  }
  return [...years].sort((a, b) => b - a);
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabelsForWeeks(weeks, year) {
  return weeks.map((week) => {
    const monthStart = week.find((day) => day.getUTCDate() === 1 && day.getUTCFullYear() === year);
    return monthStart ? MONTH_NAMES[monthStart.getUTCMonth()] : '';
  });
}

export default function ActivityCalendar({ completedTasks }) {
  const today = startOfUtcDay(new Date());
  const currentYear = today.getUTCFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const countsByDate = {};
  for (const task of completedTasks) {
    if (!task.updated_at) continue;
    const key = task.updated_at.slice(0, 10);
    countsByDate[key] = (countsByDate[key] || 0) + 1;
  }

  const years = yearsWithData(completedTasks, currentYear);
  const weeks = buildYearWeeks(selectedYear, today);
  const monthLabels = monthLabelsForWeeks(weeks, selectedYear);
  const columnStyle = { gridTemplateColumns: `repeat(${weeks.length}, minmax(6px, 1fr))` };

  return (
    <div className="activity-calendar" aria-label={`Task completion activity for ${selectedYear}`}>
      <div className="activity-calendar-header">
        <select
          className="activity-calendar-year-select"
          value={selectedYear}
          onChange={(event) => setSelectedYear(Number(event.target.value))}
          aria-label="Select year"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      <div className="activity-calendar-months" style={columnStyle}>
        {monthLabels.map((label, index) => (
          <span key={index} className="activity-calendar-month-label">
            {label}
          </span>
        ))}
      </div>
      <div className="activity-calendar-grid" style={columnStyle}>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="activity-calendar-week">
            {week.map((day) => {
              const isVisible = day.getUTCFullYear() === selectedYear && day <= today;
              if (!isVisible) {
                return <div key={day.toISOString()} className="activity-calendar-day activity-calendar-day-empty" />;
              }
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
