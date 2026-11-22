<script setup lang="ts">
// ── A STARTING POINT, NOT LEGAL ADVICE ───────────────────────────────────────
// This is a plain-language terms template for a solo/small free service. It is
// written to be readable and to describe what this codebase actually does,
// which is the part generators get wrong.
//
// It is NOT reviewed by a lawyer and is not tailored to your jurisdiction,
// your entity, or what you actually sell. Have someone qualified read it before
// you launch. The banner at the top of the page says the same thing to
// you, in the browser, until you remove it.

definePageMeta({
  publicPage: {
    changefreq: 'yearly',
    priority: '0.3',
    title: 'Terms of Service',
    summary:
      'The contract: what you may do with the service, who owns your content, and the limits of our liability.',
  },
})

const config = useRuntimeConfig()

// Bump when you change the terms. Users are entitled to know when the deal changed.
const LAST_UPDATED = '2026-11-15'

const app = computed(() => config.public.appName)
const entity = computed(() => config.public.legalEntity)
const support = computed(() => config.public.supportEmail)

useSeo({
  title: 'Terms of Service',
  description: `The terms that govern your use of ${config.public.appName} — acceptable use, your content, and liability.`,
  breadcrumb: [{ name: 'Terms of Service', path: '/terms' }],
})
</script>

<template>
  <article class="mx-auto flex max-w-2xl flex-col gap-8 py-12">
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Template — replace before launch"
      description="These terms are an unreviewed starting point. Have a lawyer adapt them to your entity and jurisdiction, then delete this notice."
    />

    <header class="flex flex-col gap-2">
      <h1 class="text-4xl text-highlighted">Terms of Service</h1>
      <p class="text-sm text-muted">Last updated {{ LAST_UPDATED }}</p>
    </header>

    <div class="flex flex-col gap-6 text-default">
      <section class="flex flex-col gap-3">
        <h2 class="text-2xl text-highlighted">1. Who we are</h2>
        <p>
          {{ app }} is a product of {{ entity }}, a New York limited liability company ("we", "us"),
          which operates the service. By creating an account or using the service you agree to these
          terms. If you don't agree, don't use the service.
        </p>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-2xl text-highlighted">2. Your account</h2>
        <p>
          You sign in through a third-party provider, and your verified email address identifies
          your account. You're responsible for what happens under it, including keeping access to
          that email and that provider account.
        </p>
        <p>
          You must be old enough to enter a contract where you live, and you may not use
          {{ app }} for anything unlawful, or in a way that degrades it for other people.
        </p>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-2xl text-highlighted">3. Your content</h2>
        <p>
          Anything you put into {{ app }} stays yours. You grant us only the permission needed to
          operate the service — storing it, backing it up, and displaying it back to you. We don't
          sell it, and we don't use it to train models.
        </p>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-2xl text-highlighted">4. Availability</h2>
        <p>
          We work to keep {{ app }} running, but we don't promise uninterrupted service. We may
          change or remove features, and we'll tell you ahead of a change that materially reduces
          what the service does.
        </p>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-2xl text-highlighted">5. Suspension and termination</h2>
        <p>
          We may suspend or close an account that breaks these terms, abuses the service, or is used
          for fraud. Except in cases of abuse or legal obligation, we'll tell you why. You can stop
          using {{ app }} whenever you like.
        </p>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-2xl text-highlighted">6. Liability</h2>
        <p>
          {{ app }} is provided as-is. To the extent the law allows, our total liability to you is
          limited to what you paid us in the twelve months before the claim, and we aren't liable
          for indirect or consequential losses. Nothing here limits liability that can't legally be
          limited.
        </p>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-2xl text-highlighted">9. Changes to these terms</h2>
        <p>
          We'll post material changes here and update the date above before they take effect.
          Continuing to use {{ app }} after that means you accept them.
        </p>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-2xl text-highlighted">10. Contact</h2>
        <p>
          Questions about these terms:
          <ULink :to="`mailto:${support}`" class="text-primary underline underline-offset-2">{{
            support
          }}</ULink
          >.
        </p>
      </section>
    </div>
  </article>
</template>
