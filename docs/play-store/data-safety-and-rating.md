# Google Play — Data Safety & Content Rating answers

Pre-filled answers for the two questionnaires. They reflect the app's actual
behaviour: fully offline, no data collected, no third-party SDKs, only the
`INTERNET` permission (a WebView requirement, not used to transmit user data).

## Data safety form

**Play Console → Policy → App content → Data safety**

- **Does your app collect or share any of the required user data types?**
  → **No.**
- **Is all of the user data collected by your app encrypted in transit?**
  → Not applicable (no data is collected or transmitted).
- **Do you provide a way for users to request that their data be deleted?**
  → Not applicable (no data is collected or stored off-device).

Result: the data-safety section will show "No data collected" and
"No data shared."

> If you ever add analytics, crash reporting, ads, or any network feature,
> this form must be updated before release.

## Content rating questionnaire

**Play Console → Policy → App content → Content ratings**

- **Category:** Reference, News, or Educational.
- **Violence / scary content:** None. (The words "attack", "intercept", and
  "eavesdropper" refer to standard cryptography teaching concepts, not violence.)
- **Sexual content:** None.
- **Profanity / crude humor:** None.
- **Controlled substances:** None.
- **Gambling:** None. (Playing-card imagery is used to model a cipher key; there
  is no wagering, simulated gambling, or casino content.)
- **User-generated content / social features / sharing location:** None.

Expected result: **Everyone / PEGI 3.**

## Other "App content" declarations

- **Ads:** No, the app contains no ads.
- **Target audience & content:** Suitable for all ages; not primarily
  child-directed, but safe for children (collects no data).
- **Government app:** No.
- **Financial features:** No.
- **Privacy policy URL:** https://systemslibrarian.github.io/DeckBook/privacy.html
