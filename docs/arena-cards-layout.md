# Arena Cards layout

Arena's Cards view reuses `useCardsLayout` and `useCardsLayout.utils` unchanged from
[`pubky/pubky-app` dev at `abf0935213b4d8b3458053beb21e4ce72d7e1950`](https://github.com/pubky/pubky-app/tree/abf0935213b4d8b3458053beb21e4ce72d7e1950/src/hooks/useCardsLayout).

`ArenaStandings` applies the existing shared feed column and gap constants to the
ordered list. The hook measures each card and places it in the shortest column,
preserving DOM order and stable columns through content-height changes. Top
spacing uses a margin because the measured container must have no padding.

Arena retains its post, people, and tag card content, ranking order, controls,
and dialog behavior. The layout picker uses Pubky's Cards label and
`LayoutDashboard` icon. No new dependency is required.
