<script setup lang="ts">
// The house's shell, for every page (DESIGN.md › The house): the mark, the
// four places, the menu, and one quiet footer line. The places and the menu
// are in layers/post/app/components/House/.

const config = useRuntimeConfig()
const { loggedIn } = useUserSession()
const route = useRoute()

const appName = config.public.appName
const supportEmail = config.public.supportEmail
const year = new Date().getFullYear()

// Writing is quiet: on a phone the bar of places gives way to the paper and
// the keyboard.
const writing = computed(() => route.path === '/write' || route.path.startsWith('/w/'))
// A new account has two pages to finish before any place has something in
// it; until then the places would only lead back to those pages.
const settingUp = computed(() => route.path.startsWith('/welcome'))
const bar = computed(() => loggedIn.value && !writing.value && !settingUp.value)
// A "Sign in" button on the sign-in page would link to the page it is on.
const signingIn = computed(() => route.path.startsWith('/auth/'))
</script>

<template>
  <div class="flex min-h-dvh flex-col overflow-x-clip bg-default">
    <!-- Skip link — WCAG 2.4.1. First focusable element on every page.
         Visually hidden until focused. -->
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-sm focus:bg-elevated focus:px-4 focus:py-2 focus:text-highlighted focus:ring-2 focus:ring-primary"
    >
      Skip to content
    </a>

    <!-- Sticky from `sm` up only. On a phone the places are pinned to the
         bottom, and two pinned bars leave too little of a letter on screen.
         Height is NuxtUI's --ui-header-height, which main.css also uses for
         scroll-padding. -->
    <header class="top-0 z-40 border-b border-default bg-default sm:sticky">
      <UContainer>
        <div class="flex h-(--ui-header-height) items-center justify-between gap-4">
          <!-- The mark goes home: the mantel when signed in. It and every
               generated icon come from BrandLogo (DESIGN.md › Brand mark). -->
          <NuxtLink
            :to="loggedIn ? '/mantel' : '/'"
            class="min-touch flex items-center"
            :aria-label="loggedIn ? `${appName}: your mantel` : `${appName}: home`"
          >
            <BrandLogo />
          </NuxtLink>

          <div v-if="loggedIn" class="flex items-center gap-4">
            <HousePlaces v-if="!settingUp" class="hidden sm:flex" />
            <HouseMenu />
          </div>
          <UButton
            v-else-if="!signingIn"
            to="/auth/sign-in"
            color="neutral"
            variant="outline"
            size="sm"
            class="min-touch"
          >
            Sign in
          </UButton>
        </div>
      </UContainer>
    </header>

    <!-- tabindex="-1" so the skip link moves focus here, not just the scroll
         position. `main` is only ever focused programmatically, and a ring
         around the whole page reads as a rendering bug. design-check-ignore -->
    <UContainer id="main" as="main" tabindex="-1" class="flex-1 focus:outline-none">
      <LettersSignUpSteps />
      <slot />
    </UContainer>

    <!-- One quiet line. Terms and privacy have to be reachable from every
         page; feedback is here rather than floating over what someone is
         reading. The bottom padding clears the phone's bar of places. -->
    <footer class="mt-16 border-t border-default" :class="{ 'pb-16 sm:pb-0': bar }">
      <UContainer>
        <div
          class="flex flex-col gap-3 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between"
        >
          <p>© {{ year }} {{ appName }}</p>
          <nav aria-label="Footer" class="flex flex-wrap items-center gap-x-6 gap-y-2">
            <ULink to="/how" class="text-muted hover:text-default">How it works</ULink>
            <ULink to="/privacy" class="text-muted hover:text-default">Privacy</ULink>
            <ULink to="/terms" class="text-muted hover:text-default">Terms</ULink>
            <ULink to="/changelog" class="text-muted hover:text-default">Changelog</ULink>
            <ULink :to="`mailto:${supportEmail}`" class="text-muted hover:text-default">
              Support
            </ULink>
            <FeedbackWidget position="inline" color="neutral" variant="link" size="sm" />
            <UColorModeButton size="sm" class="min-touch" />
          </nav>
        </div>
      </UContainer>
    </footer>

    <HousePlaces v-if="bar" bar class="sm:hidden" />
  </div>
</template>
