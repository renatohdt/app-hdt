import { ReactNode } from "react";

export function AdminTable({
  headers,
  children
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black/20">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="border-b border-white/10 bg-white/[0.02]">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}
