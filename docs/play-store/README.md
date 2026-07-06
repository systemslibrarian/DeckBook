# Publishing DeckBook to Google Play

Everything you need to get DeckBook onto the Play Store. You have a developer
account, so the remaining work is: produce a signed bundle, fill in the store
listing, and submit for review.

## Contents of this folder

| File | What it's for |
| --- | --- |
| [listing.md](listing.md) | App name, short/full description, category, contact — copy-paste into the listing |
| [privacy policy](../../public/privacy.html) | Hosted at `…/DeckBook/privacy.html` after the next Pages deploy |
| [data-safety-and-rating.md](data-safety-and-rating.md) | Pre-filled Data safety + Content rating answers |
| `assets/` | Icon (512), feature graphic (1024×500), 4 phone screenshots (1080×1920) |

Regenerate the graphics anytime:

```bash
npm run build && npm run preview -- --port 4173 &   # serve the built app
npm run store:assets                                 # writes docs/play-store/assets/
```

## Step 1 — Produce the signed release bundle (`.aab`)

Play requires an Android App Bundle signed with your own key (not the debug
key). Two ways, both using the signing config already in `android/build.gradle`:

**A. Locally** — create `android/key.properties` from
[key.properties.example](../../android/key.properties.example), then:

```bash
cd android && ./gradlew bundleRelease
# -> android/app/build/outputs/bundle/release/app-release.aab
```

**B. In CI** — add the four `DECKBOOK_*` secrets (see the repo README →
"Release signing"), then push a version tag:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

The `android-release` job builds the signed `.aab` and attaches it to the tag's
draft release for download.

> **Recommended:** keep **Play App Signing** enabled (the default). You upload
> with your *upload key*; Google manages the final signing key. Back up your
> keystore regardless — losing the upload key means you must reset it with
> Google support.

## Step 2 — Create the app in Play Console

1. **Play Console → Create app.** Name `DeckBook: Cipher Museum`, Language
   English (US), type **App**, **Free**. Accept the declarations.
2. Complete **App content** (left nav → Policy): Privacy policy URL, Ads (No),
   Data safety, Content rating, Target audience, Government app (No) — use
   [data-safety-and-rating.md](data-safety-and-rating.md).

## Step 3 — Store listing

**Grow → Store presence → Main store listing.** Paste from
[listing.md](listing.md) and upload from `assets/`:

- App icon → `assets/icon-512.png`
- Feature graphic → `assets/feature-graphic.png`
- Phone screenshots → `assets/screenshot-1..4-*.png` (need at least 2)

## Step 4 — Upload the bundle and roll out

1. Start with **Testing → Internal testing** (fastest, no review wait). Create a
   release, upload the `.aab`, add your email as a tester, and install via the
   opt-in link to sanity-check the release build on a real device.
2. When ready, promote to **Production** (or Closed/Open testing first).

> **New personal developer accounts** created after Nov 2023 must run **Closed
> testing with at least 12 testers for 14 days** before Production is unlocked.
> If that applies to your account, do Step 4 as Closed testing first. Established
> or organization accounts can go straight to Production.

## Step 5 — Submit for review

Send the Production release for review. First reviews typically take a few days.
After approval the app is live on Google Play.

## Pre-submit checklist

- [ ] Signed `.aab` built (Step 1) — NOT the debug APK
- [ ] `versionCode` / `versionName` bumped in `android/app/build.gradle` for each release
- [ ] Privacy policy live at the URL (push to `main` deploys `public/privacy.html`)
- [ ] Data safety = "No data collected", Content rating submitted
- [ ] Listing copy + all graphics uploaded
- [ ] Keystore / upload key backed up somewhere safe
- [ ] "Educational demo, not real cryptography" stated in the description
