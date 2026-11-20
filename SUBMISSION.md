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

PlainPage rewrites any text or web page in plain language at three reading levels, keeping every fact, number, date and warning. A fact check then compares every number, date, time and phone number with the original, on the device, and lists anything that went missing. A privacy shield hides names, phone numbers and account or ID numbers from the cloud. One button turns a letter or notice into a to-do list with deadlines. It adds a three-point summary, a list of difficult words with simple meanings, and an explanation for any word the reader selects. A reading-level meter shows the result, for example "Grade 14 to Grade 8". The reader can change font (including dyslexia-friendly fonts), spacing and background, use a reading ruler, listen to the text, compare it with the original, and get the result in 12 languages. Pages and words can be saved to a personal library in Firestore. It ships on two platforms from one Firebase project: a hosted web app (an installable PWA that works offline) with a Chrome side-panel extension, and a native Android app. On Android, text can be shared to PlainPage from any app, or selected in any app and sent through the text-selection menu.

### How it uses Firebase AI Logic

Every prompt runs through the Firebase AI Logic hybrid inference SDK. PlainPage uses all four inference modes, chosen per job by a small tested router that explains its choice to the reader before anything is sent:

- **Private mode or offline:** `ONLY_ON_DEVICE`. The page never leaves the device. If the device cannot do the job, PlainPage refuses rather than leak.
- **A short page in a language Gemini Nano can write:** `PREFER_ON_DEVICE`. Private, free and instant.
- **No local model yet:** `PREFER_ON_DEVICE`, and the SDK falls back to the cloud.
- **A long page:** `PREFER_IN_CLOUD`, for speed, with the device as the safety net.
- **A language the local model cannot write (for example Tamil):** `ONLY_IN_CLOUD`.

On top of the SDK's fallback, PlainPage recovers mid-page in both directions. If the local model fails on a section, that section is retried in the cloud. If the cloud runs out of quota, the section is re-split to fit the local model and finished on the device. Pages are split to fit each model: small streaming pieces on-device, large pieces in the cloud.

**The device protects what the cloud sees.** When text has to go to the cloud, PlainPage's privacy shield first replaces names, phone numbers, emails and account, card or ID numbers with placeholders on the device, and puts them back when the answer arrives, even mid-stream and through translation. Readers can open "Show what the cloud saw". After every rewrite, a deterministic fact check compares numbers, dates, times and phone numbers with the original. In a test against the live cloud model, four requests for a sample bank letter contained none of its personal details, and the fact check reported 14 of 14 details kept. The to-do list is routed on its own, so a long page rewritten in the cloud can still get its to-do list on the device.

Each section shows the `inferenceSource` the SDK reports, and a receipt at the end states how many parts ran on the device and how many in the cloud. "Nothing from this page left your device" is only shown when the cloud was never asked.

Other SDK features used: streaming (`generateContentStream`), structured JSON output with one schema passed to both models (`responseSchema` and `responseConstraint`), and `initializeDeviceModel()` with download progress.

### One SDK across Web and Android

The same hybrid design runs on both platforms through Firebase AI Logic: the JS SDK in Chrome (Gemini Nano through the Prompt API) and the Android SDK with `firebase-ai-ondevice` (Gemini Nano through AICore). Both apps use the same routing rules, the same prompts, the same cloud model and the same Remote Config keys, so one change in the console retunes both. The router adapts to each platform's on-device limits: Android's smaller window and validated languages are separate Remote Config values, so phones keep short English text local and hand the rest to the cloud.

The web app also works in Safari on iPhone and in other mobile browsers, where it falls back to the cloud model because on-device inference on the web is only available in desktop Chrome. (This is not a native iOS app, so iOS is not selected as a platform.)

### Other Firebase products

- **App Check** is enforced on the AI Logic API. For judging, the hosted site, extension and Android app use registered debug tokens, which the rules accept; the code also supports reCAPTCHA v3 for production.
- **Remote Config** holds the router's settings (cloud model, length threshold, chunk sizes, on-device languages), so the hybrid balance can be retuned with no release when Chrome ships a larger model or a new language.
- **Authentication** gives every visitor an anonymous account with zero sign-up, upgradeable to Google.
- **Cloud Firestore** stores preferences, saved pages and the word list per user, with an offline cache and per-user security rules.
- **Hosting** serves the web app.

### Value

PlainPage gives people who struggle with dense text a private, free way to understand the documents that matter in their lives. Hybrid inference is what makes it possible: on-device keeps sensitive documents private and makes the tool free to run and usable offline, and the cloud makes sure it still works on every device, for long documents and in more languages. Everything runs on free tiers, so it can stay free for the people who need it.

## Demo video script (under 3 minutes)

Record on a computer where Chrome's on-device model is ready, so the green "On this device" moments are real. Use the **Bank letter** sample.

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | The bank letter sample in the text box | "Letters from banks, hospitals and councils are the hardest things to read, and the most important." |
| 0:12 | The green "On this device" banner | "PlainPage tells you where it will run before it starts. This one fits on the laptop." |
| 0:20 | Press "Make it plain", text streams in | "Gemini Nano in Chrome, through Firebase AI Logic. Nothing leaves the laptop." |
| 0:35 | "In short" and the reading-level meter | "The three points that matter, and proof it is easier: grade 8 down to grade 3." |
| 0:45 | The Fact check card, "14 of 14 kept" | "A simple version is only useful if it is accurate. Every amount, date and phone number is checked against the original, on the device." |
| 0:58 | Press "Make a to-do list" | "One tap turns the letter into a to-do list with the deadline." |
| 1:10 | Back, choose Tamil; banner turns blue with the Privacy shield line | "Tamil needs the cloud. Before anything is sent, the name, account number, phone and email are swapped for placeholders on the device." |
| 1:25 | The Tamil result, then "Show what the cloud saw" | "The answer comes back in Tamil with the real details put back. This is everything the cloud saw." |
| 1:45 | Turn on Private mode with Tamil selected | "Private mode never sends anything. If the device can't do the job, PlainPage says so instead of leaking." |
| 1:55 | Display panel: OpenDyslexic, spacing; press Listen | "Fonts, spacing and read-aloud, for dyslexic readers." |
| 2:10 | Extension: toolbar button on a real web page | "The Chrome extension does it for any web page in one click." |
| 2:25 | Android: select text in another app, "Make it plain", then the to-do list | "And on Android, the same hybrid SDK: select text in any app." |
| 2:45 | Firebase console: Remote Config parameters | "One Firebase project and one Remote Config tune both apps. PlainPage: on your device when it can, in the cloud when it must, and private either way." |

## Checklist before submitting

- [ ] Firebase project created, `.env.local` filled in, `npm run deploy` done, hosted URL opens
- [ ] App Check debug tokens registered for the web app and the Android app
- [ ] On-device model downloaded in Chrome, and one page rewritten "On this device"
- [ ] One long page rewritten "In the cloud"
- [ ] Repository is public on GitHub, with the Apache 2.0 license showing in the About section
- [ ] Video uploaded to YouTube as public, under 3 minutes, in English
- [ ] Devpost form: platform set to Web/Chrome, URL, repository and video links added
