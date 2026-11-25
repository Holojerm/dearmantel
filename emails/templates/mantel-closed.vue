<!-- Sent by the letters layer (layers/letters) to everyone who wrote to a kept
     mantel when its keepers close it. Fixed wording: the mantel's name and a
     link. It says nothing of who closed it or why. -->
<template>
  <EmailLayout heading="{{mantelName}}'s mantel is closed">
    <EmailParagraph>
      Its keepers have closed <Raw>{{mantelName}}</Raw>'s mantel. You can no longer write to it.
    </EmailParagraph>
    <EmailParagraph>
      Letters you posted to it that had not arrived yet come back to you with your next post. The
      letters that already arrived stay on the mantel, with its keepers.
    </EmailParagraph>
    <EmailButton href="{{url}}">See who you write with</EmailButton>
    <template #footnote>
      Button not working? Paste this into your browser: <Raw>{{url}}</Raw>
    </template>
  </EmailLayout>
</template>
