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
- Keep the interactive image laboratory on the index route and preserve its visual design. Enhancement runs through the local Node bridge and persistent MATLAB worker; base MATLAB algorithms do not require Image Processing Toolbox. Do not present browser previews as MATLAB results. Run the complete local app with `npm run dev:full`.
