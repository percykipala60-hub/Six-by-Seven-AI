import { describe, expect, it } from 'vitest';
import { notificationDraft, type ReceivedAppNotification } from '../lib/inter-app-notifications';

const notification: ReceivedAppNotification = {
  id: 'local-1',
  appId: 'whatsapp',
  appName: 'WhatsApp',
  title: 'Sam',
  text: 'Tu viens ?',
  receivedAt: 1,
};

describe('notificationDraft', () => {
  it('prepares the title and message for the user to review in Six', () => {
    expect(notificationDraft(notification)).toBe('Sam\nTu viens ?');
  });

  it('omits empty fields and limits the imported content to 2000 characters', () => {
    expect(notificationDraft({ ...notification, title: ' ', text: 'Message' })).toBe('Message');
    expect(notificationDraft({ ...notification, title: '', text: 'x'.repeat(2500) })).toHaveLength(
      2000,
    );
  });
});
