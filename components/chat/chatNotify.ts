import { toast } from '@/components/ds/Toast';

export type ChatNotice = { type: 'success' | 'error'; message: string };
/** How chat hooks report an outcome; shown through the app's one toaster (spec §5.9). */
export type ChatNotify = (notice: ChatNotice) => void;

export const chatNotify: ChatNotify = ({ type, message }) => {
  if (type === 'error') toast.error(message);
  else toast(message);
};
