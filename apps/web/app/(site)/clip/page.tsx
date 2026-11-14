import type { Metadata } from 'next';
import { BrowserClipper } from '@/components/browser-clipper';
import { serverMode } from '@/lib/mode';

export const metadata: Metadata = { title: 'Clip a video', description: 'Split a video into clips right in your browser. Nothing is uploaded.' };
export const dynamic = 'force-dynamic';

export default function ClipPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-mist-50 sm:text-3xl">Clip a video</h1>
        <p className="mt-2 max-w-2xl text-mist-300">Choose a video, pick how to split it, and download the clips. Everything runs in your browser, so your video never leaves your device and there&apos;s nothing to sign up for.</p>
      </div>
      <BrowserClipper serverAvailable={serverMode()} />
    </div>
  );
}
