/**
 * Thin wrapper around `MediaRecorder` for recording voice notes in the browser.
 *
 * The recorder picks the first supported mime type (webm/opus where available),
 * tracks elapsed time (MediaRecorder does not report duration itself), and
 * always releases the microphone on stop/cancel so the tab privacy indicator
 * turns off.
 */

export type VoiceRecording = {
  blob: Blob
  mimeType: string
  /** Recorded length in seconds. */
  duration: number
  extension: string
}

export type ActiveRecorder = {
  /** Milliseconds since recording started. */
  elapsed: () => number
  stop: () => Promise<VoiceRecording>
  cancel: () => void
  /** Live input level 0..1, for a simple meter. */
  level: () => number
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

export function isRecordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  )
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4')) return 'm4a'
  return 'webm'
}

export async function startRecording(): Promise<ActiveRecorder> {
  if (!isRecordingSupported()) {
    throw new Error('Recording is not supported in this browser.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: BlobPart[] = []
  const startedAt = performance.now()
  let stopped = false

  // Lightweight level meter (0..1) driven by an analyser, sampled on demand.
  let analyser: AnalyserNode | null = null
  let sampleData: Uint8Array<ArrayBuffer> | null = null
  let audioContext: AudioContext | null = null
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctor) {
      audioContext = new Ctor()
      const source = audioContext.createMediaStreamSource(stream)
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      sampleData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
    }
  } catch {
    // A level meter is optional; recording still works without it.
  }

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  })

  const release = () => {
    for (const track of stream.getTracks()) track.stop()
    if (audioContext && audioContext.state !== 'closed') void audioContext.close()
    audioContext = null
    analyser = null
    sampleData = null
  }

  recorder.start()

  return {
    elapsed: () => performance.now() - startedAt,
    level: () => {
      if (!analyser || !sampleData) return 0
      analyser.getByteFrequencyData(sampleData)
      let sum = 0
      for (const value of sampleData) sum += value
      return Math.min(1, sum / sampleData.length / 128)
    },
    stop: () =>
      new Promise<VoiceRecording>((resolve) => {
        if (stopped) return
        stopped = true
        const duration = (performance.now() - startedAt) / 1000
        recorder.addEventListener(
          'stop',
          () => {
            const resolvedMime = mimeType || recorder.mimeType || 'audio/webm'
            const blob = new Blob(chunks, { type: resolvedMime })
            release()
            resolve({
              blob,
              mimeType: resolvedMime,
              duration,
              extension: extensionFor(resolvedMime),
            })
          },
          { once: true },
        )
        recorder.stop()
      }),
    cancel: () => {
      if (stopped) return
      stopped = true
      try {
        recorder.stop()
      } catch {
        // Recorder may already be inactive.
      }
      release()
    },
  }
}
