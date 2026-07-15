/**
 * formatter.js — Result formatting for SQL query output.
 *
 * Formats results as:
 *   - ASCII tables for tabular data (multiple rows/columns)
 *   - Single values for scalar results
 *   - Summary stats for large result sets
 */

// ── Table formatting ────────────────────────────────────────────────────────

/**
 * Format a value for display in a table cell.
 */
function formatValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') {
    // Format currency-like amounts
    if (Number.isFinite(val) && !Number.isInteger(val)) {
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return val.toLocaleString('en-US');
  }
  if (typeof val === 'string' && val.length > 50) {
    return val.slice(0, 47) + '...';
  }
  return String(val);
}

/**
 * Build an ASCII table from an array of row objects.
 *
 * @param {Object[]} rows       - Array of row objects
 * @param {Object}   [options]  - Formatting options
 * @param {number}   [options.maxRows=50]  - Max rows to display
 * @param {string[]} [options.columns]     - Column order (default: all keys)
 * @returns {string} Formatted ASCII table
 */
export function formatTable(rows, options = {}) {
  if (!rows || rows.length === 0) {
    return '(no results)';
  }

  const maxRows = options.maxRows ?? 50;
  const columns = options.columns ?? Object.keys(rows[0]);
  const displayRows = rows.slice(0, maxRows);

  // Calculate column widths
  const widths = {};
  for (const col of columns) {
    widths[col] = col.length;
  }
  for (const row of displayRows) {
    for (const col of columns) {
      const formatted = formatValue(row[col]);
      widths[col] = Math.max(widths[col], formatted.length);
    }
  }

  // Build header
  const header = '| ' + columns.map(c => c.padEnd(widths[c])).join(' | ') + ' |';
  const separator = '|' + columns.map(c => '-'.repeat(widths[c] + 2)).join('|') + '|';

  // Build rows
  const rowLines = displayRows.map(row => {
    const cells = columns.map(col => {
      const val = formatValue(row[col]);
      // Right-align numbers
      if (typeof row[col] === 'number') {
        return val.padStart(widths[col]);
      }
      return val.padEnd(widths[col]);
    });
    return '| ' + cells.join(' | ') + ' |';
  });

  const parts = [header, separator, ...rowLines];

  if (rows.length > maxRows) {
    parts.push(`\n... and ${rows.length - maxRows} more rows (${rows.length} total)`);
  }

  return parts.join('\n');
}

// ── Scalar formatting ───────────────────────────────────────────────────────

/**
 * Format a scalar result (single value).
 */
export function formatScalar(rows) {
  if (!rows || rows.length === 0) return '(no result)';

  const row = rows[0];
  const keys = Object.keys(row);

  if (keys.length === 1) {
    const key = keys[0];
    const val = row[key];
    return `${key}: ${formatValue(val)}`;
  }

  // Multiple columns but single row — format as key-value pairs
  return keys.map(k => `${k}: ${formatValue(row[k])}`).join('\n');
}

// ── Auto-detect format ──────────────────────────────────────────────────────

/**
 * Automatically choose the best format for the result set.
 *
 * @param {Object[]} rows        - Query result rows
 * @param {Object}   metadata    - Query metadata (sql, executionTimeMs, etc.)
 * @returns {string} Formatted output string
 */
export function formatResult(rows, metadata = {}) {
  const parts = [];

  if (!rows || rows.length === 0) {
    parts.push('No results found.');
  } else if (rows.length === 1 && Object.keys(rows[0]).length <= 3) {
    // Scalar or single-row result
    parts.push(formatScalar(rows));
  } else {
    // Tabular result
    parts.push(formatTable(rows));
  }

  // Append metadata
  const metaParts = [];
  if (metadata.sql) {
    metaParts.push(`Query: ${metadata.sql}`);
  }
  if (metadata.executionTimeMs !== undefined) {
    metaParts.push(`Execution time: ${metadata.executionTimeMs}ms`);
  }
  if (metadata.rowCount !== undefined) {
    metaParts.push(`Rows returned: ${metadata.rowCount}`);
  }
  if (metadata.costLevel) {
    metaParts.push(`Cost estimate: ${metadata.costLevel}`);
  }

  if (metaParts.length > 0) {
    parts.push('');
    parts.push(metaParts.join(' | '));
  }

  return parts.join('\n');
}

// ── Chart-ready export ──────────────────────────────────────────────────────

/**
 * Transform query results into a chart-ready format.
 * Attempts to identify label and value columns automatically.
 *
 * @param {Object[]} rows - Query result rows
 * @returns {Object} { labels: string[], datasets: { label: string, data: number[] }[], type: string }
 */
export function toChartData(rows) {
  if (!rows || rows.length === 0) {
    return { labels: [], datasets: [], type: 'empty' };
  }

  const keys = Object.keys(rows[0]);
  const numericKeys = keys.filter(k => typeof rows[0][k] === 'number');
  const stringKeys = keys.filter(k => typeof rows[0][k] === 'string');

  // Use first string column as labels, numeric columns as datasets
  const labelKey = stringKeys[0] || keys[0];
  const dataKeys = numericKeys.length > 0 ? numericKeys : keys.filter(k => k !== labelKey);

  const labels = rows.map(r => String(r[labelKey]));
  const datasets = dataKeys.map(k => ({
    label: k,
    data: rows.map(r => Number(r[k]) || 0),
  }));

  // Suggest chart type
  let type = 'bar';
  if (labels.length > 12) type = 'line';
  if (numericKeys.length === 1 && rows.length <= 8) type = 'pie';

  return { labels, datasets, type };
}
