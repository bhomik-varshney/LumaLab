<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture decisions
- Keep the interactive image laboratory on the index route, with its charcoal/green studio design, selective glass panels, prominent comparison canvas, contextual method controls, and real image analysis. Enhancement runs through the local Node bridge and persistent MATLAB worker; base MATLAB algorithms do not require Image Processing Toolbox. Run the complete local app with `npm run dev:full`.
- Use the shared `{imageId, category, method, parameters}` processing route. Keep Intensity Transformations and Spatial Filtering distinct, validate relevant parameters at both bridge and MATLAB boundaries, and preserve the original. Stretch cutoffs are normalized input brightness values, not percentiles. Spatial smoothing/sharpening uses replicated boundaries and RGB luminance; Sobel produces a labeled grayscale edge map. Histograms/statistics must describe the actual returned image. Do not present browser previews as MATLAB results.
