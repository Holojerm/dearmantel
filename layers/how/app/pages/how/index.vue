<script setup lang="ts">
// The index of the explainer pages: the four kinds of mantel, then the four
// things they share. The titles and summaries are each page's own.
definePageMeta({
  publicPage: {
    changefreq: 'monthly',
    priority: '0.9',
    title: 'How it works',
    summary:
      'An index of plain explanations with diagrams: the four kinds of mantel, the postal calendar, what is encrypted, how keys are kept, and how to join from an invitation.',
  },
})

const pages = useHowPages()
const mantels = computed(() => pages.filter((page) => page.group === 'mantel'))
const topics = computed(() => pages.filter((page) => page.group === 'topic'))

const ART = {
  letters: resolveComponent('ArtEnvelope'),
  family: resolveComponent('ArtPrint'),
  child: resolveComponent('ArtLeaf'),
  anniversary: resolveComponent('ArtCard'),
  post: resolveComponent('ArtPostbox'),
  'who-reads': resolveComponent('ArtSheet'),
  keys: resolveComponent('ArtKey'),
  joining: resolveComponent('ArtStamp'),
}

const PROPS: Partial<Record<keyof typeof ART, Record<string, string>>> = {
  child: { day: '14', month: 'JUN', year: '2044' },
  joining: { seed: 'invite' },
}

useSeo({
  title: 'How it works',
  description:
    'Plain explanations with diagrams: letters between two people, a family, a child’s mantel, anniversary letters, the post and the keys.',
  breadcrumb: [{ name: 'How it works', path: '/how' }],
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-16 pt-12 sm:pt-16">
    <header class="flex flex-col gap-4">
      <h1 class="text-4xl text-highlighted sm:text-5xl">How it works</h1>
      <p class="max-w-2xl font-serif text-lg text-toned">
        One page for each thing Dear Mantel does, with a drawing for every step. The drawings move
        as you scroll: scrolling is the days going by.
      </p>
    </header>

    <section
      v-for="group in [
        { title: 'Kinds of mantel', pages: mantels },
        { title: 'What they all share', pages: topics },
      ]"
      :key="group.title"
      class="flex flex-col gap-6"
    >
      <h2 class="text-2xl text-highlighted sm:text-3xl">{{ group.title }}</h2>
      <ul class="grid gap-4 sm:grid-cols-2">
        <li v-for="page in group.pages" :key="page.path">
          <NuxtLink
            :to="page.path"
            class="flex h-full flex-col gap-3 rounded-md border border-default bg-elevated p-6 hover:border-accented focus-visible:ring-2 focus-visible:ring-primary"
          >
            <component
              :is="ART[page.slug]"
              class="h-12 self-start"
              v-bind="PROPS[page.slug] ?? {}"
            />
            <span class="font-display text-xl text-highlighted">{{ page.title }}</span>
            <span class="text-sm text-default">{{ page.summary }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
