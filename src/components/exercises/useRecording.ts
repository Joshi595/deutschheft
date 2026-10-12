import { useState } from 'react';

/** Recordings live only in this tab's memory, keyed by what was being said. */
const recordings = new Map<string, string>();

/**
 * Record the microphone so the learner can listen back. Nothing is uploaded or
 * stored: the recording is gone when the tab closes.
 */
export function useRecording(id: string) {
  const [url, setUrl] = useState<string | undefined>(recordings.get(id));
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [failed, setFailed] = useState(false);

  async function start(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      media.ondataavailable = (event) => chunks.push(event.data);
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const next = URL.createObjectURL(new Blob(chunks, { type: media.mimeType }));
        recordings.set(id, next);
        setUrl(next);
        setRecorder(null);
      };
      media.start();
      setRecorder(media);
      setFailed(false);
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  }

  return { url, recording: recorder !== null, failed, start, stop: () => recorder?.stop() };
}
