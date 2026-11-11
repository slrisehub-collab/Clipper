import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Help and support' };
export const dynamic = 'force-dynamic';

const sections = [
  {
    id: 'getting-started', title: 'Getting started',
    items: [
      ['How do I split a video?', 'Go to New project, upload a file or paste a direct video link, wait a few seconds while we read the video, choose how you want it split and press Generate clips.'],
      ['Do I have to stay on the page?', 'No. Processing runs on our servers. You can close the tab; the project will be in your dashboard when you return.'],
      ['Can I make different clips from the same video?', 'Yes. Open the project and choose New clips from this video. Your source stays in the project, so there is no need to upload it again.'],
    ],
  },
  {
    id: 'uploads', title: 'Uploads and links',
    items: [
      ['My upload stopped halfway.', 'Choose the same file again from the same browser. ClipForge remembers which parts arrived and continues from there instead of starting over.'],
      ['Why was my link rejected?', 'Only direct links to video files can be imported, such as a link ending in .mp4 on your own server or a public cloud storage link. Pages on YouTube, TikTok, Instagram, Facebook, X, Vimeo and streaming services are not supported, because those platforms do not permit third-party downloads. If the video is yours, download it from the platform and upload the file.'],
      ['What is the maximum file size?', 'It depends on your plan. You can see your limits in Settings.'],
    ],
  },
  {
    id: 'clipping', title: 'Clipping options',
    items: [
      ['Equal duration', 'Every clip has the length you choose. The last clip holds whatever is left over, so a 10-minute video in 45-second clips gives 13 clips of 45 seconds and one of 15 seconds.'],
      ['Number of clips', 'Enter how many clips you want and ClipForge divides the video evenly.'],
      ['Regular intervals', 'Cuts the video every N seconds or minutes. Same result as equal duration, with interval presets.'],
      ['Custom ranges', 'Type a start and end for each clip, for example 05:00 to 06:15. Ranges may overlap and can be in any order.'],
      ['Precise vs Fast', 'Precise re-encodes where it has to, so cuts land exactly where you asked. Fast never re-encodes and moves each cut to the nearest keyframe. Fast is much quicker but cuts can shift by a second or two. Fast only applies when you keep the original quality, shape and a compatible format.'],
      ['Changing the aspect ratio', 'Crop fills the new frame and trims the edges. Fit keeps the whole picture and adds black bars. ClipForge never stretches the picture.'],
    ],
  },
  {
    id: 'downloads', title: 'Downloads and sharing',
    items: [
      ['Downloading many clips', 'Use Download all, or select clips and choose Download selected. A ZIP is built on the server and is kept for 24 hours.'],
      ['Sharing a clip', 'Choose Share on a clip to create a public link that plays only that clip. Turn sharing off to revoke the link.'],
      ['My download link says it expired.', 'Links are short-lived for security. Reload the page to get fresh ones.'],
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-mist-50">Help and support</h1>
      <p className="mt-3 text-mist-300">
        Answers to common questions.{' '}
        {process.env.SUPPORT_EMAIL ? <>If something isn&apos;t covered here, email <a className="text-volt-300 hover:underline" href={`mailto:${process.env.SUPPORT_EMAIL}`}>{process.env.SUPPORT_EMAIL}</a>.</> : null}
      </p>
      <nav className="mt-8 flex flex-wrap gap-2">
        {[...sections.map((s) => [s.id, s.title]), ['copyright', 'Copyright']].map(([id, t]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-white/[0.08] px-3 py-1 text-[13px] text-mist-300 hover:text-mist-50">{t}</a>
        ))}
      </nav>
      <div className="mt-10 space-y-12">
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="text-lg font-semibold text-mist-50">{s.title}</h2>
            <dl className="mt-4 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-ink-850">
              {s.items.map(([q, a]) => (
                <div key={q} className="px-5 py-4">
                  <dt className="font-medium text-mist-100">{q}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-mist-300">{a}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <section id="copyright" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-mist-50">Copyright and acceptable use</h2>
          <div className="mt-4 space-y-3 rounded-xl border border-white/[0.06] bg-ink-850 p-5 text-sm leading-relaxed text-mist-300">
            <p>Only upload or import videos that you own or have permission to use. ClipForge does not bypass DRM, logins, paywalls or any other access control, and does not download from platforms whose terms prohibit it.</p>
            <p>Accounts used to process content without permission may be suspended. Rights holders can report misuse to the site administrator.</p>
          </div>
        </section>
      </div>
      <p className="mt-12 text-sm text-mist-400">Still stuck? <Link href="/app" className="text-volt-300 hover:underline">Go to your dashboard</Link> and check the project for an error message; it usually says exactly what went wrong.</p>
    </div>
  );
}
