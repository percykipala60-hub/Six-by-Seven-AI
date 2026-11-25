import { beforeEach, expect, it, vi } from 'vitest';
const speech = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  isOnDeviceRecognitionAvailable: vi.fn(),
  start: vi.fn(),
  forceStop: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isPluginAvailable: () => true } }));
vi.mock('@capgo/capacitor-speech-recognition', () => ({ SpeechRecognition: speech }));
import { dicterSurTelephone } from '../lib/dictee-native';
beforeEach(() => {
  vi.resetAllMocks();
  speech.checkPermissions.mockResolvedValue({ speechRecognition: 'granted' });
  speech.isOnDeviceRecognitionAvailable.mockResolvedValue({ available: true });
  speech.forceStop.mockResolvedValue(undefined);
});
it('exige le traitement local et libère le micro après la dictée', async () => {
  speech.start.mockResolvedValue({ matches: [' Bonjour Six '] });
  expect(await dicterSurTelephone(new AbortController().signal)).toBe('Bonjour Six');
  expect(speech.start).toHaveBeenCalledWith(
    expect.objectContaining({ useOnDeviceRecognition: true, popup: false }),
  );
  expect(speech.forceStop).toHaveBeenCalledOnce();
});
it('ne démarre pas si la permission est refusée', async () => {
  speech.checkPermissions.mockResolvedValue({ speechRecognition: 'denied' });
  speech.requestPermissions.mockResolvedValue({ speechRecognition: 'denied' });
  await expect(dicterSurTelephone(new AbortController().signal)).rejects.toThrow('refus');
  expect(speech.start).not.toHaveBeenCalled();
});
it('ne bascule pas vers le cloud lorsque le moteur local manque', async () => {
  speech.isOnDeviceRecognitionAvailable.mockResolvedValue({ available: false });
  await expect(dicterSurTelephone(new AbortController().signal)).rejects.toThrow('indisponible');
  expect(speech.start).not.toHaveBeenCalled();
});
it('annule une reconnaissance en attente et coupe le micro', async () => {
  const controller = new AbortController();
  speech.start.mockImplementation(() => {
    queueMicrotask(() => controller.abort());
    return new Promise(() => {});
  });
  await expect(dicterSurTelephone(controller.signal)).rejects.toThrow('Dictée arrêtée.');
  expect(speech.forceStop).toHaveBeenCalledOnce();
});
