<!-- Sent by the letters layer (layers/letters) to every keeper of a mantel
     but the one whose vote closed it. More than half of them agreed, so a
     keeper who did not vote learns of it here. Fixed wording. -->
<template>
  <EmailLayout heading="{{mantelName}}'s mantel is closed">
    <EmailParagraph>
      More than half of the keepers of <Raw>{{mantelName}}</Raw>'s mantel agreed to close it, and it
      is now closed. Nobody can write to it, its keepers included. The people who wrote to it have
      been told, and letters still on their way to it go back to whoever sent them.
    </EmailParagraph>
    <EmailParagraph>
      You still keep it. Its letters, its key and its recovery code stay as they are: you can read
      the letters and keep a copy of them.
    </EmailParagraph>
    <EmailButton href="{{url}}">Open the mantel</EmailButton>
    <template #footnote>
      Button not working? Paste this into your browser: <Raw>{{url}}</Raw>
    </template>
  </EmailLayout>
</template>
