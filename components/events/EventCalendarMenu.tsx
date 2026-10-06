'use client';

import { CalendarPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ds/Button';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ds/Menu';
import { googleCalendarUrl, outlookCalendarUrl, type CalendarEvent } from '@/lib/events/calendarLinks';

/** Google, Apple / .ics and Outlook targets for one event; render inside a Menu. */
export function CalendarMenuItems({ event }: { event: CalendarEvent }) {
  const google = googleCalendarUrl(event);
  const outlook = outlookCalendarUrl(event);
  if (!google || !outlook) return null;
  return (
    <>
      <MenuItem asChild>
        <a href={google} target="_blank" rel="noopener noreferrer">
          Google Calendar
        </a>
      </MenuItem>
      <MenuItem asChild>
        <a href={`/e/${event.id}/calendar.ics`} download>
          Apple Calendar (.ics)
        </a>
      </MenuItem>
      <MenuItem asChild>
        <a href={outlook} target="_blank" rel="noopener noreferrer">
          Outlook
        </a>
      </MenuItem>
    </>
  );
}

/** "Add to calendar" (spec §7.6.2), trailing the date row. */
export function EventCalendarMenu({ event, trigger }: { event: CalendarEvent; trigger?: ReactNode }) {
  if (!googleCalendarUrl(event)) return null;
  return (
    <Menu>
      <MenuTrigger asChild>
        {trigger ?? (
          <Button variant="plain" size="sm" icon={CalendarPlus}>
            <span className="sr-only sm:not-sr-only">Add to calendar</span>
          </Button>
        )}
      </MenuTrigger>
      <MenuContent align="end">
        <CalendarMenuItems event={event} />
      </MenuContent>
    </Menu>
  );
}
