<script setup lang="ts">
// The part of the privacy page that is about letters. It says what the
// encryption does and, as plainly, what it does not.
</script>

<template>
  <section class="flex flex-col gap-3">
    <h2 class="text-2xl text-highlighted">Your letters</h2>
    <p>
      <strong class="text-highlighted">We cannot read them.</strong> A letter is encrypted in your
      browser before it is saved, under a key made for that letter. That key is wrapped to your
      public key and to your correspondent's, and to no one else's. Our servers store the result and
      hold nothing that opens it: not the text, not the paper and ink you chose, not the name you
      signed. A photo is made smaller in your browser, which also removes where and when it was
      taken, and is encrypted under the same key with your description of it.
    </p>
    <p>
      <strong class="text-highlighted">What we do see.</strong> Who writes to whom, when a letter
      was sealed, and when it is due to arrive, because the post cannot run without them. We can see
      roughly how long a letter is, whether it has a photo, and the size of that file. We also keep
      the city you chose, your mail days and your delivery hour. We store the city, never your
      location.
    </p>
    <p>
      <strong class="text-highlighted">Your keys.</strong> Your private key is made on your device.
      We keep copies of it locked under your password, your passkeys and your recovery code, none of
      which we have. A password can be guessed, though: someone who stole our database could try
      passwords against the locked copy, slowly, so a long password that you use nowhere else is
      what protects it. If you lose all three, we can restore your account by email, but nobody can
      restore the letters.
    </p>
    <p>
      <strong class="text-highlighted">What this does not protect against.</strong> It protects your
      letters from a leak of our database, from our backups and from anyone browsing our tables. It
      does not protect you from us shipping altered code to your browser, and we do not yet offer a
      way to check that the public key we hand you is really your correspondent's. The source is
      public so the first can be checked.
    </p>
    <p>
      <strong class="text-highlighted">Keeping a copy.</strong> You can save your letters to your
      own device at any time, from the page called Keep a copy. The copy is put together in your
      browser and is not encrypted, so it is yours to look after. Making it shows us nothing we
      could not already see. Someone who keeps a mantel can save the letters that have been opened
      on it in the same way; sealed and unopened letters are never in a copy.
    </p>
    <p>
      <strong class="text-highlighted">Invitations.</strong> When you invite someone, we send one
      email to the address you give and keep that address until they accept or 30 days pass, then
      delete it.
    </p>
    <p>
      <strong class="text-highlighted">No receipts.</strong> We record when a letter is delivered
      and first opened so your own mantel can show it. That is never shown to the person who wrote
      to you, or to anyone else.
    </p>
    <p>
      <strong class="text-highlighted">A letter belongs to whoever received it.</strong> If you
      delete your account, the letters you received, your drafts and your settings are deleted.
      Letters you sent stay with the people you sent them to.
    </p>
    <p>
      <strong class="text-highlighted">Families.</strong> A letter to a family is one letter with a
      separate copy of its key for each person in it, locked to that person's own key. We can see
      who is in a family and its name. Someone who joins later reads what is written after they
      join: earlier letters were never locked to their key, and we cannot change that for them.
    </p>
    <p>
      <strong class="text-highlighted">News of a child.</strong> The people who keep a child's
      mantel can send a letter of news to the people they have invited to read it. It is a letter
      like any other: encrypted, with a separate copy of its key for each reader, and for the
      child's mantel when the writer chooses. We can see who reads a child's news and when a letter
      of it is sent, never what it says. The readers are shown only to the mantel's keepers: nobody
      who gets the news is told who else does. A reader can stop at any time, and so can a keeper
      stop them; copies still on their way to that person are then deleted.
    </p>
    <p>
      <strong class="text-highlighted">Mantels kept for someone else.</strong> A child's mantel, or
      a couple's, has a key of its own. Its keepers each hold a copy, locked to their own key, and
      one more copy is locked under a printed recovery code. We hold none that we can open. When
      mail arrives there, its keepers are told, the same way you are told about your own. The code
      opens the key in the browser of whoever types it and is never sent to us; what we receive is a
      value derived from it that proves they hold it. A keeper who uses it gets their own access
      back. Anyone else is asking to become a keeper: every keeper is emailed, and it takes effect
      after 30 days unless one of them cancels. When someone stops keeping a mantel we delete their
      copy, but they were given the key and may have kept it. The keepers who remain are asked to
      change the key, which is done in one of their browsers. Once it is changed, the old key opens
      nothing we hold, and the recovery code printed before stops working. Until then it could, if
      our database were ever copied. A mantel's only keeper can delete their account after typing
      its recovery code, which is checked in their browser; we receive only the value derived from
      it. The mantel and its letters stay, with nobody keeping them, and only that code opens them
      again.
    </p>
    <p>
      <strong class="text-highlighted">Letters from a child's mantel.</strong> A keeper can write as
      the child to someone who writes to the mantel. The letter is encrypted in that keeper's
      browser like any other, and the writer's copy is locked to the mantel's key, so every keeper
      can read it and we cannot. The person it goes to sees it as from the child, not from which
      keeper wrote it. We can see that the mantel sealed a letter, to whom and when, as we can for
      any letter.
    </p>
    <p>
      <strong class="text-highlighted">Sealed letters.</strong> A letter to a kept mantel can be
      sealed until a day its keepers chose, if they allow it; its writer picks among those days. We
      store those days and the words the keepers gave them, which are not encrypted. Until a
      letter's day we do not hand its text, its photo or its key to anyone, its keepers included;
      the writer keeps their own copy. This is a promise kept by our servers together with a key we
      do not have. It is not a mathematical time lock: to read one early, both we and a keeper would
      have to break the rules. We can see the day a letter is sealed until. One exception to "its
      key": when a mantel's key is changed, the browser of the keeper changing it is handed each
      letter's locked key, to lock it again to the new one. The letter and its photo are still
      withheld.
    </p>
    <p>
      <strong class="text-highlighted">Letters from guests.</strong> A couple can print a link that
      lets wedding guests write to them without an account. A guest's letter is encrypted in the
      guest's browser to the couple's key, with the name they signed inside it. We learn when a
      letter was sent and how large it is, and nothing about who sent it beyond what any web request
      shows. No account is made, and the guest keeps no way to change or recall it. The link carries
      a fingerprint of the couple's key after the # sign, which browsers do not send to us, so the
      page can tell if it has been handed the wrong key.
    </p>
    <p>
      <strong class="text-highlighted">Your copy.</strong> The download on your account page holds
      what we hold: who you write with, your city and mail days, and every letter you wrote or
      received, encrypted as we store it. It leaves out letters still on their way to you, and it
      says nothing about what became of a letter you sent. Photos are not in it yet. To read your
      letters, open them here on a device that has your key.
    </p>
  </section>
</template>
