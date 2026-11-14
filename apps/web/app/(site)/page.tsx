import Link from 'next/link';
import {
  ArrowRight, Clock, Download, FileVideo, Gauge, Layers, Link2, Lock, Scissors, Split, Upload, Archive, Crop, Volume2,
} from 'lucide-react';
import { buttonClass } from '@/components/styles';
import { PricingCards } from '@/components/pricing-cards';
import { loadPlans } from '@/lib/plans';
import { serverMode } from '@/lib/mode';

export const dynamic = 'force-dynamic';

function HeroVisual() {
  // A static illustration of the product: one long source split into equal clips.
  const clips = Array.from({ length: 10 }, (_, i) => i);
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="rounded-2xl border border-white/[0.08] bg-ink-850 p-4 shadow-2xl sm:p-5">
        <div className="flex items-center justify-between text-[12px] text-mist-400">
          <span className="flex items-center gap-2"><FileVideo className="h-3.5 w-3.5" /> webinar-recording.mp4</span>
          <span className="tabular-nums">1:00:00 · 1920×1080</span>
        </div>
        <div className="mt-3 aspect-video overflow-hidden rounded-lg bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900">
          <div className="flex h-full items-end p-3">
            <div className="h-1 w-full rounded-full bg-white/10"><div className="h-1 w-[38%] rounded-full bg-volt-400" /></div>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="font-medium text-mist-200">Equal duration · 6 minutes</span>
            <span className="text-volt-300">10 clips</span>
          </div>
          <div className="flex h-9 gap-[3px]">
            {clips.map((i) => (
              <div key={i} className={`flex-1 rounded-[4px] ${i % 2 ? 'bg-volt-500/50' : 'bg-volt-400/80'}`} />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-mist-500"><span>00:00</span><span>30:00</span><span>1:00:00</span></div>
        </div>
      </div>
      <div className="absolute -bottom-6 -right-2 hidden w-56 rounded-xl border border-white/[0.08] bg-ink-800 p-3 shadow-2xl sm:block">
        <div className="flex items-center gap-2 text-[12px] text-mist-200"><Download className="h-3.5 w-3.5 text-signal-green" /> clip-007.mp4 ready</div>
        <div className="mt-2 h-1.5 rounded-full bg-ink-600"><div className="h-1.5 w-full rounded-full bg-signal-green/80" /></div>
      </div>
    </div>
  );
}

const steps = [
  { icon: Upload, title: 'Add your video', body: 'Drop in a file from your device or paste a direct link to a video file. Large uploads resume if your connection drops.' },
  { icon: Scissors, title: 'Choose how to split', body: 'Pick a clip length, a number of clips, regular intervals, or exact start and end times. The timeline shows every cut before you commit.' },
  { icon: Download, title: 'Download your clips', body: 'Each clip is a separate, playable file. Preview them, download one at a time, or grab the whole set as a ZIP.' },
];

const features = [
  { icon: Split, title: 'Four ways to split', body: 'Equal duration, a fixed number of clips, regular intervals, or custom ranges with frame-accurate cuts.' },
  { icon: Gauge, title: 'Real FFmpeg processing', body: 'Clips are cut on our servers. When no re-encode is needed and a cut lands on a keyframe, we copy the stream for speed.' },
  { icon: Crop, title: 'Resize and reframe', body: 'Export at original quality, 1080p, 720p or 480p, and switch to 16:9, 9:16 or 1:1 with a proper crop or fit. Nothing is stretched.' },
  { icon: Volume2, title: 'Audio stays in sync', body: 'Every clip keeps audio and picture aligned. You can also remove audio entirely.' },
  { icon: Archive, title: 'Bulk downloads', body: 'Select the clips you want and download them as one ZIP, built on the server so large sets do not crash your browser.' },
  { icon: Lock, title: 'Private by default', body: 'Your files are only reachable through short-lived signed links. Nobody else can see your videos unless you share a clip.' },
];

const faqs = [
  { q: 'Can I paste a YouTube, TikTok or Instagram link?', a: 'No. Those platforms do not allow their videos to be downloaded by third-party tools, and ClipForge does not get around their restrictions. If the video is yours, download it from the platform and upload the file. Direct links to video files (for example a link ending in .mp4 on your own server or cloud storage) work.' },
  { q: 'What happens to the last clip if the video does not divide evenly?', a: 'The final clip holds whatever is left. A 10-minute video split into 45-second clips gives 13 full clips and a 14th clip of 15 seconds.' },
  { q: 'Are the cuts exact?', a: 'In Precise mode, yes. Clips are re-encoded where needed so each one starts and ends where you asked. Fast mode skips re-encoding and moves each cut to the nearest keyframe, which is quicker but can shift a cut by a second or two.' },
  { q: 'How long do you keep my files?', a: 'Your source videos and clips stay in your account until you delete them. ZIP downloads are removed after 24 hours; you can create a new one at any time.' },
  { q: 'Which formats can I upload?', a: 'MP4, MOV, WebM and MKV are fully supported. AVI, MPEG, 3GP and TS files usually work too. Clips are exported as MP4 (H.264) or WebM (VP9).' },
  { q: 'Do I need to keep the page open while it processes?', a: 'No. Processing runs in the background on our servers. Close the tab and come back later; your project will be in the dashboard.' },
];

export default async function LandingPage() {
  const plans = await loadPlans();
  const start = serverMode() ? '/app/new' : '/clip';
  return (
    <>
      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:pb-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-volt-400/25 bg-volt-400/[0.08] px-3 py-1 text-[12px] font-medium text-volt-300">
              <Clock className="h-3.5 w-3.5" /> From one long video to many clips in minutes
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-mist-50 sm:text-5xl">
              Turn Long Videos Into Perfect Clips.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-mist-300">
              Upload a video or paste a supported video link. Choose your preferred duration and let ClipForge automatically split your video into ready-to-download clips.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={start} className={buttonClass('primary', 'lg')}>Start Clipping <ArrowRight className="h-4 w-4" /></Link>
              <Link href="#how-it-works" className={buttonClass('outline', 'lg')}>Explore How It Works</Link>
            </div>
            <p className="mt-4 text-[13px] text-mist-500">{serverMode() ? 'Free plan available. No card required.' : 'Free. No sign-up. Your video stays on your device.'}</p>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 border-b border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-mist-50 sm:text-3xl">How it works</h2>
          <p className="mt-2 max-w-xl text-mist-300">Three steps, one button. No timeline editing required.</p>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-white/[0.06] bg-ink-850 p-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-volt-400/10 text-volt-300"><s.icon className="h-[18px] w-[18px]" /></span>
                  <span className="font-mono text-[12px] text-mist-500">Step {i + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold text-mist-50">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-mist-300">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 border-b border-white/[0.06] bg-ink-950/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-mist-50 sm:text-3xl">Built to do one job well</h2>
          <p className="mt-2 max-w-xl text-mist-300">Splitting video sounds simple until the audio drifts or the last clip goes missing. ClipForge handles the details.</p>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="bg-ink-900 p-6">
                <f.icon className="h-5 w-5 text-volt-400" />
                <h3 className="mt-4 font-semibold text-mist-50">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-mist-300">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="formats" className="scroll-mt-20 border-b border-white/[0.06]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-mist-50 sm:text-3xl">Supported formats</h2>
            <p className="mt-2 text-mist-300">Bring the files you already have.</p>
            <dl className="mt-8 space-y-5 text-sm">
              <div>
                <dt className="flex items-center gap-2 font-medium text-mist-100"><Upload className="h-4 w-4 text-volt-400" /> Upload</dt>
                <dd className="mt-1 text-mist-300">MP4, MOV, WebM, MKV. AVI, MPEG, 3GP and TS usually work.</dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 font-medium text-mist-100"><Link2 className="h-4 w-4 text-volt-400" /> Paste a link</dt>
                <dd className="mt-1 text-mist-300">Direct, publicly reachable links to a video file. Social media and streaming pages are not supported; upload the file instead.</dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 font-medium text-mist-100"><Layers className="h-4 w-4 text-volt-400" /> Export</dt>
                <dd className="mt-1 text-mist-300">MP4 (H.264 + AAC) or WebM (VP9 + Opus), at original quality, 1080p, 720p or 480p.</dd>
              </div>
            </dl>
          </div>
          <div className="grid grid-cols-2 gap-3 self-start sm:grid-cols-4">
            {['MP4', 'MOV', 'WEBM', 'MKV', 'AVI', 'MPEG', '3GP', 'TS'].map((f, i) => (
              <div key={f} className={`grid h-20 place-items-center rounded-xl border font-mono text-sm ${i < 4 ? 'border-volt-400/25 bg-volt-400/[0.06] text-volt-300' : 'border-white/[0.06] bg-ink-850 text-mist-400'}`}>.{f.toLowerCase()}</div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 border-b border-white/[0.06] bg-ink-950/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-mist-50 sm:text-3xl">Pricing</h2>
          <p className="mt-2 max-w-xl text-mist-300">Start free. Move to Pro when you need longer videos and more processing time.</p>
          {plans.length ? <div className="mt-10"><PricingCards plans={plans} /></div> : <p className="mt-6 text-mist-300">Clipping in your browser is free. Accounts with saved projects and server processing come with the hosted version.</p>}
        </div>
      </section>

      <section id="faq" className="scroll-mt-20">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-mist-50 sm:text-3xl">Frequently asked questions</h2>
          <div className="mt-8 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-ink-850">
            {faqs.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-mist-50">
                  {f.q}
                  <span className="text-mist-400 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-mist-300">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-12 rounded-2xl border border-volt-400/20 bg-gradient-to-br from-volt-400/[0.08] to-transparent p-8 text-center">
            <h3 className="text-xl font-semibold text-mist-50">Ready to split your first video?</h3>
            <p className="mt-2 text-mist-300">It takes about a minute to set up.</p>
            <Link href={start} className={buttonClass('primary', 'lg', 'mt-6')}>Start Clipping <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
