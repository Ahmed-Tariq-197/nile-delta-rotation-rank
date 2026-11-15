# Accessibility

What was checked, and how.

| Check                             | How                                                                                                     | Result                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Color contrast                    | `bun run contrast` computes WCAG ratios from the color tokens in `src/styles.css`                       | All listed text/background and interface pairs pass AA               |
| Layout at 390 px and 1280 px wide | Headless Chromium screenshots of Planner, Method and data, About                                        | No horizontal page scroll; wide tables scroll in their own container |
| Console                           | Headless Chromium on the same pages                                                                     | No errors or warnings logged                                         |
| Reduced motion                    | `prefers-reduced-motion` stops the orbit animation, hides the moving satellite and shortens transitions | Reviewed in the stylesheet                                           |

Built in:

- Skip link, header/main/footer landmarks, one h1 per page; focus moves to the page title on navigation.
- Visible gold focus ring on every interactive element; 44 px minimum touch targets on buttons, links and toggles.
- Point picker is a radio group with arrow-key support; crop toggles are switches.
- Async data status is announced through polite live regions.
- The NDVI chart has a text summary and a "Show as table" alternative.
- Evidence grades use a symbol, text and color (never color alone).

Not checked: screen readers on real devices, Firefox and Safari.
