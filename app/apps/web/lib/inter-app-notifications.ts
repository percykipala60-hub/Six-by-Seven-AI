export const INTER_APP_APPS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'messages', label: 'Messages / SMS' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'gmail', label: 'Gmail' },
] as const;

export type InterAppId = (typeof INTER_APP_APPS)[number]['id'];

export interface ReceivedAppNotification {
  id: string;
  appId: InterAppId;
  appName: string;
  title: string;
  text: string;
  receivedAt: number;
}

export function notificationDraft(item: ReceivedAppNotification): string {
  return [item.title, item.text]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);
}
