# DeckBook — Teaching Guide

A ready-to-run lesson using the DeckBook exhibit
(<https://systemslibrarian.github.io/DeckBook/>). Designed for one 45–60
minute session. No accounts, no installs — it runs in any browser and works
offline once loaded.

## Who it's for

- Middle school through undergraduate, and general public / museum visitors.
- No prior cryptography needed. Basic arithmetic (addition, remainders) helps
  for the math section but is optional — the app shows every step.

## Learning objectives

By the end, students can:

1. Explain that DeckBook's **secret is the deck order**, and the index code is
   only a public label.
2. Describe a **stream cipher**: each letter is shifted by one keystream value
   derived from a card.
3. State the **one-time rule** and explain, with a concrete attack, **why key
   reuse breaks it**.
4. Explain **why key distribution is the hard problem** cryptography must
   solve, and name modern answers (Diffie–Hellman, KEMs, post-quantum ML-KEM).

## Materials

- One device per student or pair (or a projector in presenter mode).
- Optional: a real deck of cards per pair (use the app's **Print physical deck
  sheet**).
- The [student worksheet](worksheet.md).

## Lesson flow

| Time | Segment | In the app |
| ---- | ------- | ---------- |
| 5 min | Hook: "Get a secret to Bob while Eve listens." | Read the mission banner; open **Watch It Work** and press Play. |
| 8 min | How the cipher works | Expand **How the Cipher Works**; step **Watch It Work** one card at a time. |
| 7 min | Make and share a key | **Step 1 Generate**, **Step 2 Pick a key**, **Step 3 Prepare the deck** (print a deck sheet if using real cards). |
| 8 min | Send a real message | **Step 4 Encrypt**, then scan the QR / open the share link on a second device and **Step 5 Decrypt**. |
| 10 min | Break it: key reuse | **Key Reuse Attack Lab** — encrypt two messages with one key, then drag a crib to reveal the other message. Try **Auto-solve**. |
| 7 min | Challenge | **Challenge: Eve's Intercept** — students crack a puzzle in pairs. |
| 5 min | Wrap: why modern crypto exists | Expand **Why Modern Key Exchange Exists**; discuss the distribution problem. |

## Discussion questions

1. Why can the index code be public but the deck order cannot?
2. A full deck encrypts only 52 letters. Why can't we just reuse it for a
   longer message? What exactly goes wrong?
3. In the attack lab, the keystream "cancelled out." In your own words, why
   does subtracting one ciphertext from the other remove the key?
4. DeckBook needs both people to share a deck **in advance**. Why is that the
   hardest part to do safely? How do Alice and Bob agree on a deck if Eve
   watches everything?
5. Where have you relied on encryption today without noticing?

## Assessment (exit ticket)

- **Recall:** What is the secret in DeckBook? (The deck order.)
- **Apply:** Encrypt `HI` given keystream `[16, 22]`. (Answer: `XE`.)
- **Analyze:** An operator encrypts two notes with the same key. What can an
  eavesdropper compute without the key, and why? (The difference of the
  plaintexts; the key cancels.)
- **Evaluate:** Name one reason DeckBook is not safe for real secrets and one
  thing modern cryptography does to fix it.

## Standards tie-ins (USA)

- **CSTA 3B-NI-04 / 3A-NI-06:** cybersecurity, encryption, and tradeoffs.
- **AP Computer Science Principles:** Big Idea 5 (Impact) and data security.
- **Common Core Math (modular arithmetic):** remainders and patterns.

## Accessibility & setup notes

- Keyboard-navigable; screen-reader labels throughout; honors reduced motion.
- **Presenter mode** (button in the header) gives a full-screen, arrow-key,
  one-panel-at-a-time view for projectors and kiosks.
- Works offline after the first load (installable as an app).

## A note on honesty

DeckBook is a teaching model, **not** production cryptography. Make the limits
explicit — that honesty is itself part of the lesson about why real systems
are hard.
