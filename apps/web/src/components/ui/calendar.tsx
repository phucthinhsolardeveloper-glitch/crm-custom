'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Lịch chọn ngày (wrapper react-day-picker v9) - theme Sky Blue, locale tiếng Việt.
 *
 * Dùng cho range picker ở bộ lọc thời gian. classNames map theo UI keys của v9
 * (button_previous, month_caption, range_start/middle/end, ...).
 */
export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={vi}
      className={cn('p-2', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'space-y-2',
        month_caption: 'flex h-8 items-center justify-center',
        caption_label: 'text-sm font-medium capitalize text-slate-700',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          'absolute left-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md',
          'text-slate-500 hover:bg-slate-100 disabled:opacity-30',
        ),
        button_next: cn(
          'absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md',
          'text-slate-500 hover:bg-slate-100 disabled:opacity-30',
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-8 text-[11px] font-normal text-slate-400',
        week: 'mt-1 flex w-full',
        day: cn(
          'relative h-8 w-8 p-0 text-center text-sm',
          '[&:has([aria-selected])]:bg-sky-100',
          'first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md',
        ),
        day_button: cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-md font-normal',
          'hover:bg-sky-100 aria-selected:opacity-100',
        ),
        range_start: 'rounded-l-md bg-sky-500 [&>button]:bg-sky-500 [&>button]:text-white [&>button:hover]:bg-sky-500',
        range_end: 'rounded-r-md bg-sky-500 [&>button]:bg-sky-500 [&>button]:text-white [&>button:hover]:bg-sky-500',
        range_middle: 'bg-sky-100 [&>button]:bg-transparent [&>button]:text-sky-900 [&>button:hover]:bg-sky-200',
        selected: '[&>button]:bg-sky-500 [&>button]:text-white [&>button:hover]:bg-sky-500',
        today: '[&>button]:border [&>button]:border-sky-400',
        outside: 'text-slate-300 aria-selected:text-slate-400',
        disabled: 'text-slate-300 opacity-50',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === 'left' ? (
            <ChevronLeft className="h-4 w-4" {...rest} />
          ) : (
            <ChevronRight className="h-4 w-4" {...rest} />
          ),
      }}
      {...props}
    />
  );
}
