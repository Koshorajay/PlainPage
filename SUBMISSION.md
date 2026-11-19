# Devpost submission kit

Everything to paste into the #BuildHybridAI submission form. Replace the items in ALL CAPS.

## Basics

- **Project name:** PlainPage
- **Tagline:** Makes any page easy to read. On your device when it can, in the cloud when it must.
- **Platforms:** Web (Chrome): hosted web app and Chrome extension; Android: native app (select both on the form)
- **Hosted URL:** https://plainpage-31699.web.app
- **Repository:** https://github.com/Koshorajay/PlainPage
- **Video:** YOUR_YOUTUBE_LINK
- **New or existing project:** New. Built entirely during the submission period.

## Text description

### The problem

The documents people most need to understand are the hardest to read: a rental agreement, a medicine leaflet, a letter from the bank, a notice from the council. For people with dyslexia, low literacy, or a different first language, that is a barrier to health, money and rights. AI can rewrite these in plain language, but most tools send every word to a server, and these are exactly the documents people want to keep private.

### What PlainPage does

PlainPage rewrites any text or web page in plain language at three reading levels, keeping every fact, number, date and warning. It adds a three-point summary, a list of difficult words with simple meanings, and an explanation for any word the reader selects. A reading-level meter shows the result, for example "Grade 14 to Grade 8". The reader can change font (including dyslexia-friendly fonts), spacing and background, use a reading ruler, listen to the text, compare it with the original, and get the result in 12 languages. Pages and words can be saved to a library that syncs across devices. It ships on two platforms from one Firebase project: a hosted web app (an installable PWA that works offline) with a Chrome side-panel extension, and a native Android app. On Android, text can be shared to PlainPage from any app, or selected in any app and sent through the text-selection menu.

### How it uses Firebase AI Logic

Every prompt runs through the Firebase AI Logic hybrid inference SDK. PlainPage uses all four inference modes, chosen per job by a small tested router that explains its choice to the reader before anything is sent:

- **Private mode or offline:** `ONLY_ON_DEVICE`. The page never leaves the device. If the device cannot do the job, PlainPage refuses rather than leak.
- **A short page in a language Gemini Nano can write:** `PREFER_ON_DEVICE`. Private, free and instant.
- **No local model yet:** `PREFER_ON_DEVICE`, and the SDK falls back to the cloud.
- **A long page:** `PREFER_IN_CLOUD`, for speed, with the device as the safety net.
- **A language the local model cannot write (for example Tamil):** `ONLY_IN_CLOUD`.

On top of the SDK's fallback, PlainPage recovers mid-page in both directions. If the local model fails on a section, that section is retried in the cloud. If the cloud runs out of quota, the section is re-split to fit the local model and finished on the device. Pages are split to fit each model: small streaming pieces on-device, large pieces in the cloud.

Each section shows the `inferenceSource` the SDK reports, and a receipt at the end states how many parts ran on the device and how many in the cloud. "Nothing from this page left your device" is only shown when the cloud was never asked.

Other SDK features used: streaming (`generateContentStream`), structured JSON output with one schema passed to both models (`responseSchema` and `responseConstraint`), and `initializeDeviceModel()` with download progress.

### One SDK across Web and Android

The same hybrid design runs on both platforms through Firebase AI Logic: the JS SDK in Chrome (Gemini Nano through the Prompt API) and the Android SDK with `firebase-ai-ondevice` (Gemini Nano through AICore). Both apps use the same routing rules, the same prompts, the same cloud model and the same Remote Config keys, so one change in the console retunes both. The router adapts to each platform's on-device limits: Android's smaller window and validated languages are separate Remote Config values, so phones keep short English text local and hand the rest to the cloud.

### Other Firebase products

- **App Check** protects the API: reCAPTCHA v3 on the hosted site, a debug token on localhost and in the extension.
- **Remote Config** holds the router's settings (cloud model, length threshold, chunk sizes, on-device languages), so the hybrid balance can be retuned with no release when Chrome ships a larger model or a new language.
- **Authentication** gives every visitor an anonymous account with zero sign-up, upgradeable to Google.
- **Cloud Firestore** stores preferences, saved pages and the word list per user, with an offline cache and per-user security rules.
- **Hosting** serves the web app.

### Value

PlainPage gives people who struggle with dense text a private, free way to understand the documents that matter in their lives. Hybrid inference is what makes it possible: on-device keeps sensitive documents private and makes the tool free to run and usable offline, and the cloud makes sure it still works on every device, for long documents and in more languages. Everything runs on free tiers, so it can stay free for the people who need it.

## Demo video script (under 3 minutes)

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | A dense rental agreement on screen | "Rental agreements, medicine leaflets, government notices. The documents that matter most are the hardest to read." |
| 0:15 | PlainPage home, click "Rental agreement" | "PlainPage rewrites them in plain language. Before it starts, it tells you where the work will run." Point at the green "On this device" banner. |
| 0:30 | Press "Make it plain", text streams in | "This runs on Gemini Nano inside Chrome, through Firebase AI Logic. Nothing leaves the laptop." |
| 0:50 | Summary, reading-level meter, Words to know | "A summary, the reading level before and after, and the hard words explained." |
| 1:05 | Select a word, press Explain | "Select any word to have it explained, on the device, instantly." |
| 1:15 | Display panel: OpenDyslexic, spacing, dark; then Listen | "Readers set the page up for their own eyes, or listen instead." |
| 1:30 | Paste a long document; banner turns blue | "A long page is different. PlainPage sends it to Gemini in the cloud for speed, and says so." Show the receipt. |
| 1:50 | Choose Tamil | "Languages the local model cannot write go to the cloud too." |
| 2:00 | Turn on Private mode, turn off Wi-Fi, run again | "Private mode guarantees the page stays on the device. It even works offline." |
| 2:20 | Extension: click toolbar button on a real web page | "The Chrome extension does the same for any web page, in one click." |
| 2:30 | Android: select text in another app, choose "Make it plain" | "And on Android, the same hybrid SDK: select text in any app and PlainPage rewrites it, on the phone when it can." |
| 2:35 | Firebase console: Remote Config parameters | "Remote Config tunes the router, App Check protects the API, Firestore and Auth sync the library." |
| 2:50 | Receipt: "Nothing from this page left your device" | "PlainPage. On your device when it can, in the cloud when it must." |

## Checklist before submitting

- [ ] Firebase project created, `.env.local` filled in, `npm run deploy` done, hosted URL opens
- [ ] App Check registered (reCAPTCHA v3 for the site, debug tokens for localhost and the extension)
- [ ] On-device model downloaded in Chrome, and one page rewritten "On this device"
- [ ] One long page rewritten "In the cloud"
- [ ] Repository is public on GitHub, with the Apache 2.0 license showing in the About section
- [ ] Video uploaded to YouTube as public, under 3 minutes, in English
- [ ] Devpost form: platform set to Web/Chrome, URL, repository and video links added
