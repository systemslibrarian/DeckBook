# DeckBook — Student Worksheet

Name: ______________________  Date: ____________

Open the exhibit: <https://systemslibrarian.github.io/DeckBook/>

---

## Part 1 — The idea (warm-up)

1. In DeckBook, what is the actual **secret** — the thing Eve must not learn?

   ________________________________________________

2. The **index code** (like `LANTERN-42`) travels in public. What is its job,
   and what does it *not* reveal?

   ________________________________________________

## Part 2 — How the cipher works

Letters become numbers: `A=0, B=1, … Z=25`. Each card gives a keystream number
`card value mod 26`. Encrypt by **adding mod 26**.

3. Encrypt `HI` using keystream `[16, 22]`. Show your work.

   - `H = 7`, `7 + 16 = 23 → ______`
   - `I = 8`, `8 + 22 = 30`, `30 mod 26 = ______ → ______`

   Ciphertext: ______

4. Open **Watch It Work**, type your initials, and press **Step** once.
   Which card came up, and what keystream number did it give?

   Card: ________   Keystream number: ________

## Part 3 — Send a message

5. Generate a DeckBook, pick an unused key, and encrypt a short message.
   Write the index code and the ciphertext an eavesdropper would see:

   Index code: ______________   Ciphertext: ______________________

6. Open the share link (or scan the QR) on another device. Does it decrypt?
   Explain what has to be true for decryption to work.

   ________________________________________________

## Part 4 — Break it (key reuse)

Open the **Key Reuse Attack Lab**. Encrypt two different messages with the
**same** key.

7. The lab shows `(Cipher A − Cipher B)` and `(Plain A − Plain B)`. What do you
   notice about these two lines?

   ________________________________________________

8. Why does the key disappear when you subtract one ciphertext from the other?
   (Hint: both messages were shifted by the *same* keystream.)

   ________________________________________________

9. Drag a crib (a guessed word) until readable text appears. What word did you
   guess, and what did it reveal in the other message?

   Crib: ____________  Revealed: ____________________

## Part 5 — The challenge

10. Solve **Challenge: Eve's Intercept** (Dockside). Write both recovered
    messages:

    Message A: ____________________________________

    Message B: ____________________________________

## Wrap-up

11. DeckBook needs Alice and Bob to share a deck **before** they talk. In one
    sentence, why is that the hardest part of real cryptography?

    ________________________________________________
