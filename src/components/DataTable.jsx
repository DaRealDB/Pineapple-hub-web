/**
 * Generic data table per BUILD_SPEC.md Shared Component Library > DataTable.
 *
 * Header: bg-surface-container-highest, label-caps font.
 * Cells: px-md py-sm, font-data-mono tabular-nums, horizontal borders only.
 * Row hover: bg-surface-container-high.
 *
 * @param {{
 *   columns: { key: string, label: string }[],
 *   rows: Record<string, any>[],
 *   onRowClick?: (row: Record<string, any>) => void,
 *   rowClassName?: (row: Record<string, any>) => string,
 * }} props
 */
export default function DataTable({
  columns,
  rows,
  onRowClick,
  rowClassName,
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-surface-container-highest border-b border-outline-variant">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {rows.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(row)}
              className={`hover:bg-surface-container-high transition-colors group ${
                rowClassName ? rowClassName(row) : ''
              } ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="px-md py-sm font-data-mono text-data-mono tabular-nums text-on-surface"
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
