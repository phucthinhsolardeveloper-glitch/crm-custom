'use client';

import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface CsvExportButtonProps {
  exportPath: string; // e.g. '/exports/leads'
  label?: string;
}

/** Reusable CSV export button - opens export endpoint qua Next.js proxy de co auth. */
export function CsvExportButton({ exportPath, label = 'Xuất CSV' }: CsvExportButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.open(`/api/proxy${exportPath}`, '_blank')}
    >
      <Download className="h-4 w-4 mr-1" />
      {label}
    </Button>
  );
}
