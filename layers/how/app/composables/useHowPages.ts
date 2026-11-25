// The explainer pages, in reading order. Each page's title and one-sentence
// summary are its own `publicPage` declaration, read back from the router, so
// the index, the "next" link and the landing page cannot drift from the page.
const ORDER = [
  { slug: 'letters', group: 'mantel' },
  { slug: 'family', group: 'mantel' },
  { slug: 'child', group: 'mantel' },
  { slug: 'anniversary', group: 'mantel' },
  { slug: 'post', group: 'topic' },
  { slug: 'who-reads', group: 'topic' },
  { slug: 'keys', group: 'topic' },
  { slug: 'joining', group: 'topic' },
] as const

export type HowPageLink = {
  slug: (typeof ORDER)[number]['slug']
  group: (typeof ORDER)[number]['group']
  path: string
  title: string
  summary: string
}

export function useHowPages(): HowPageLink[] {
  const routes = useRouter().getRoutes()
  return ORDER.flatMap(({ slug, group }) => {
    const path = `/how/${slug}`
    const meta = routes.find((route) => route.path === path)?.meta.publicPage
    return meta ? [{ slug, group, path, title: meta.title, summary: meta.summary }] : []
  })
}
