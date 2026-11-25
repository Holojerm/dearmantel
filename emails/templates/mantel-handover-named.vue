<!-- Sent by the keys layer (layers/keys) to every other keeper of a child's
     mantel when one of them gives the address the child will be invited at.
     Any one keeper can, so the others are told. Fixed wording. -->
<template>
  <EmailLayout heading="An address was given for {{mantelName}}">
    <EmailParagraph>
      <Raw>{{keeperName}}</Raw>, who keeps <Raw>{{mantelName}}</Raw>'s mantel with you, gave
      <Raw>{{email}}</Raw> as the address <Raw>{{mantelName}}</Raw> will take the mantel with. It is
      invited on the handover day, <Raw>{{handoverDate}}</Raw>.
    </EmailParagraph>
    <EmailParagraph>
      If that address is not <Raw>{{mantelName}}</Raw>'s, change it on the mantel's page before the
      key is handed over: any keeper can.
    </EmailParagraph>
    <EmailButton href="{{url}}">Open the mantel</EmailButton>
    <template #footnote>
      Button not working? Paste this into your browser: <Raw>{{url}}</Raw>
    </template>
  </EmailLayout>
</template>
