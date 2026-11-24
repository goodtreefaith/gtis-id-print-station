import { AlertTriangle, CheckCircle2, ImageOff, PhoneOff, RefreshCw, Search, UserRound } from 'lucide-react';
import { forwardRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { StudentRecord } from '../types';
import { studentFullName, studentGradeLine } from '../lib/student';

export interface StudentListProps {
  query: string;
  onQueryChange: (value: string) => void;
  students: StudentRecord[];
  selectedId: string | null;
  onSelect: (student: StudentRecord) => void;
  /** Enter in the search box: confirm the selection and move on. */
  onConfirm?: () => void;
  loading: boolean;
  error?: string;
  hasMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
  disabled?: boolean;
  /** Students printed today: id → time printed. */
  printedAt?: Record<string, number>;
  /** Typed text not searched yet: Enter and Ctrl+P wait for it. */
  searchPending?: boolean;
}

const HIDE_PRINTED_KEY = 'gtis-id-print-station.hide-printed';

function timeOf(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function missingFor(student: StudentRecord) {
  const missing: Array<{ key: string; label: string; icon: typeof ImageOff }> = [];
  if (!student.photoUrl) missing.push({ key: 'photo', label: 'No photo', icon: ImageOff });
  const g = student.guardian;
  if (!g.name.trim() || !g.address.trim() || !g.phone.trim()) {
    missing.push({ key: 'contact', label: 'Emergency contact incomplete', icon: PhoneOff });
  }
  return missing;
}

export const StudentList = forwardRef<HTMLInputElement, StudentListProps>(function StudentList(
  { query, onQueryChange, students: allStudents, selectedId, onSelect, onConfirm, loading, error, hasMore, onLoadMore, onRefresh, disabled, printedAt = {}, searchPending },
  searchRef
) {
  const [hidePrinted, setHidePrintedState] = useState(() => {
    try {
      return window.localStorage.getItem(HIDE_PRINTED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const setHidePrinted = (value: boolean) => {
    setHidePrintedState(value);
    try {
      window.localStorage.setItem(HIDE_PRINTED_KEY, value ? '1' : '0');
    } catch {
      // Storage unavailable: the choice lasts for this session only.
    }
  };
  const printedCount = Object.keys(printedAt).length;
  const students = hidePrinted ? allStudents.filter((student) => !printedAt[student.id] || student.id === selectedId) : allStudents;
  const activeIndex = students.findIndex((student) => student.id === selectedId);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && query) {
      event.preventDefault();
      event.stopPropagation();
      onQueryChange('');
      return;
    }
    if (event.key === 'Enter' && searchPending) {
      event.preventDefault();
      onConfirm?.();
      return;
    }
    if (!students.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = activeIndex < 0 ? 0 : Math.min(students.length - 1, Math.max(0, activeIndex + step));
      if (next !== activeIndex) {
        onSelect(students[next]);
        document.getElementById(`student-option-${students[next].id}`)?.scrollIntoView({ block: 'nearest' });
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex < 0 && !searchPending) onSelect(students[0]);
      onConfirm?.();
    }
  }

  const countLabel = loading
    ? 'Searching…'
    : students.length
      ? `${students.length}${hasMore ? '+' : ''} student${students.length === 1 ? '' : 's'}`
      : 'No students';

  return (
    <section className="zone list-zone" aria-label="Students">
      <label className="search-label" htmlFor="student-search">
        Find a student
      </label>
      <div className="search-box">
        <Search size={20} aria-hidden="true" />
        <input
          id="student-search"
          ref={searchRef}
          role="combobox"
          aria-expanded={students.length > 0}
          aria-controls="student-results"
          aria-activedescendant={activeIndex >= 0 ? `student-option-${students[activeIndex].id}` : undefined}
          aria-autocomplete="list"
          value={query}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Name or number"
        />
        {query ? (
          <button type="button" className="search-clear" onClick={() => onQueryChange('')} aria-label="Clear search">
            ×
          </button>
        ) : null}
      </div>
      <p className="search-hint">
        <span className="hint-long">↑↓ choose · Enter open · Ctrl+P print</span>
        <span className="hint-short" aria-hidden="true">
          ↑↓ · Enter · Ctrl+P
        </span>
      </p>

      <div className="list-meta">
        <span aria-live="polite">{countLabel}</span>
        {printedCount ? (
          <label className="hide-printed" title="Hide students already printed today">
            <input type="checkbox" checked={hidePrinted} onChange={(event) => setHidePrinted(event.target.checked)} />
            <span>
              Hide printed <span className="label-long">({printedCount} today)</span>
              <span className="label-short">({printedCount})</span>
            </span>
          </label>
        ) : null}
        <button type="button" className="text-button target-44 refresh-button" onClick={onRefresh} disabled={loading || disabled} aria-label="Refresh students" title="Refresh students">
          <RefreshCw size={16} aria-hidden="true" /> <span className="refresh-label">Refresh</span>
        </button>
      </div>

      <ul id="student-results" className="student-list" role="listbox" aria-label="Search results" aria-busy={loading}>
        {students.map((student) => {
          const missing = missingFor(student);
          const active = student.id === selectedId;
          return (
            <li
              key={student.id}
              id={`student-option-${student.id}`}
              role="option"
              aria-selected={active}
              className={`student-row${active ? ' is-active' : ''}`}
              onClick={() => onSelect(student)}
            >
              {student.photoUrl ? (
                <img src={student.photoUrl} alt="" className="student-thumb" />
              ) : (
                <span className="student-thumb is-empty" aria-hidden="true">
                  <UserRound size={22} />
                </span>
              )}
              <span className="student-row-text">
                <strong>{studentFullName(student)}</strong>
                <small>
                  {student.admissionNo} · {studentGradeLine(student)}
                </small>
                {printedAt[student.id] ? (
                  <span className="row-printed">
                    <CheckCircle2 size={13} aria-hidden="true" /> Printed {timeOf(printedAt[student.id])}
                  </span>
                ) : null}
                {missing.length ? (
                  <span className="row-flags">
                    {missing.map(({ key, label, icon: Icon }) => (
                      <span key={key} className="row-flag">
                        <Icon size={13} aria-hidden="true" /> {label}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
        {loading && !students.length
          ? [0, 1, 2, 3].map((n) => (
              <li key={`skeleton-${n}`} className="student-row is-skeleton" aria-hidden="true">
                <span className="student-thumb" />
                <span className="student-row-text">
                  <span className="skeleton-line" />
                  <span className="skeleton-line short" />
                </span>
              </li>
            ))
          : null}
      </ul>

      {error && !loading ? (
        <div className="list-state is-error" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <strong>Couldn’t load students.</strong>
            <p>{error}</p>
            <button type="button" className="button secondary" onClick={onRefresh}>
              <RefreshCw size={16} aria-hidden="true" /> Try again
            </button>
          </div>
        </div>
      ) : null}

      {!loading && !error && students.length === 0 ? (
        <div className="list-state">
          <Search size={20} aria-hidden="true" />
          <div>
            <strong>{query.trim() ? `No student matches “${query.trim()}”.` : 'No students yet.'}</strong>
            <p>{query.trim() ? 'Check the spelling, or search by student number.' : 'Press Refresh to load students from the portal.'}</p>
          </div>
        </div>
      ) : null}

      {hasMore && !error ? (
        <button type="button" className="button secondary wide" onClick={onLoadMore} disabled={loading}>
          {loading ? 'Loading…' : 'Show more students'}
        </button>
      ) : null}
    </section>
  );
});
