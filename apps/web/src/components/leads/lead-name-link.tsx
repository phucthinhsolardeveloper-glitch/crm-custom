'use client';

import Link from 'next/link';

interface Props {
  leadId: string;
  name: string;
}

/**
 * Ten lead trong bang - click vao ten mo trang chi tiet /leads/[id].
 */
export function LeadNameLink({ leadId, name }: Props) {
  return (
    <Link
      href={`/leads/${leadId}`}
      onClick={(e) => e.stopPropagation()}
      className="font-medium text-sky-700 hover:text-sky-900 hover:underline truncate"
    >
      {name}
    </Link>
  );
}
