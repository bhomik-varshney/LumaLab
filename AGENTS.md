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
- Mean/Gaussian/Median/Unsharp accept all odd kernel sizes 3–15. Preserve sigma/strength when size changes, and validate size in the UI, bridge, and MATLAB. Sobel remains a fixed 3×3 operator. The step walkthrough uses real browser-decoded image luminance and replicated boundaries but must stay labeled as an illustrative local simulation; never use it for export or MATLAB statistics. Keep its state separate from main enhancement state.
- Processing Sequence snapshots up to six operations and sends `{imageId, steps, runId}` to the same endpoint. `apply_operation.m` dispatches both single operations and ordered in-memory sequences. Each step consumes the preceding output; retain the original separately. Progress comes from MATLAB via `write_job_progress.m`, not an estimated percentage. Never export a partial/failed/stale sequence. Reset preserves saved steps, clear removes them, and control edits resume the single-operation preview. Keep sequence execution separate from the illustrative simulation.
