<script setup lang="ts">
// The shape every explainer page shares: a way back to the index, the page's
// own title block (`#head`, which holds its h1), its scenes, and one link on
// to the next page.
const route = useRoute()
const pages = useHowPages()
const next = computed(() => {
  const here = pages.findIndex((page) => page.path === route.path)
  return here === -1 ? null : (pages[here + 1] ?? null)
})
</script>

<template>
  <article class="mx-auto flex w-full max-w-2xl flex-col gap-16 pt-12 sm:gap-24 sm:pt-16">
    <header class="flex flex-col gap-4">
      <p>
        <ULink to="/how" class="font-mono text-xs tracking-wide text-muted uppercase">
          How it works
        </ULink>
      </p>
      <slot name="head" />
    </header>

    <slot />

    <nav
      aria-label="More of how it works"
      class="flex flex-col gap-3 border-t border-default pt-8 sm:flex-row sm:items-center sm:justify-between"
    >
      <UButton v-if="next" :to="next.path" color="neutral" variant="outline">
        Next: {{ next.title }}
      </UButton>
      <ULink to="/how" class="text-primary underline underline-offset-2">
        Everything Dear Mantel does
      </ULink>
    </nav>
  </article>
</template>
