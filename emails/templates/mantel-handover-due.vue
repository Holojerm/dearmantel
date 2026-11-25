<!-- Sent by the keys layer (layers/keys) to every keeper of a child's mantel
     on the handover day the keepers set. Fixed wording. Mailed once. -->
<template>
  <EmailLayout heading="{{mantelName}}'s handover day has come">
    <EmailParagraph>
      Today is the day you and the other keepers set for <Raw>{{mantelName}}</Raw> to take their
      mantel.
    </EmailParagraph>
    <EmailParagraph>
      If an address for <Raw>{{mantelName}}</Raw> was given, it has been invited. If not, give the
      address they will sign in with on the mantel's page. When they accept, one of you checks a
      short code with them and hands over the key.
    </EmailParagraph>
    <EmailButton href="{{url}}">Open the mantel</EmailButton>
    <template #footnote>
      Button not working? Paste this into your browser: <Raw>{{url}}</Raw>
    </template>
  </EmailLayout>
</template>
