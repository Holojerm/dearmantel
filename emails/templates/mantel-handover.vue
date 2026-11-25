<!-- Sent by the keys layer (layers/keys) on a child's handover day, to the
     address a keeper gave for the child. Fixed wording: it names the mantel
     and carries a link that needs a signed-in session, nothing else. Mailed
     once; there is no reminder. -->
<template>
  <EmailLayout heading="Letters have been kept for you">
    <EmailParagraph>
      For years, people who know you have written letters to a mantel kept for
      <Raw>{{mantelName}}</Raw> on <Raw>{{appName}}</Raw>. Its keepers set a day for it to become
      yours, and that day has come.
    </EmailParagraph>
    <EmailParagraph>
      Sign in with this address, or make an account with it. One of the keepers will then check a
      short code with you, by phone or in person, and hand you the key. Letters sealed until a later
      day stay sealed until then.
    </EmailParagraph>
    <EmailButton href="{{url}}">Take your mantel</EmailButton>
    <template #footnote>
      Button not working? Paste this into your browser: <Raw>{{url}}</Raw>
      <br /><br />
      If you don't know why you got this, ignore it: nothing more will be sent.
    </template>
  </EmailLayout>
</template>
