# Pixel Perfect Pix

LumaLab is a local image enhancement laboratory with a React/TanStack Start frontend
and real MATLAB processing. Its porcelain studio follows the warm crimson/coral
reference dashboard: a serif wordmark, navigation rail, prominent image comparison,
right-hand histogram and tools, and a full-width saved-sequence strip. Shared warm
surfaces and subtle lighting support contextual adjustments and actual image
histograms/statistics. Intensity transformations change tones; spatial filters
use neighboring pixels to smooth noise, sharpen detail, or reveal edges.

The floating **LUMA AI** button opens the Groq-backed learning assistant. Drag its
grip with a mouse or touch, or focus the grip and use arrow keys (Shift for larger
steps). Placement persists across workspaces and refreshes, stays inside the safe
viewport, and yields to nearby controls. Use **Reset position** in the assistant
panel to return to the default corner. The workspace has no footer or reserved
launcher band and stacks its panels on smaller screens. Pointer lighting affects only surface materials and
frame edges, stays static on touch screens, and respects reduced motion. Histogram
bars use actual luminance counts; preset curves illustrate the existing settings,
and sequence thumbnails show only the real input and completed output.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pixel-perfect-view-9751.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/907b37a4-a22b-4a4c-a40d-2234f9db09d0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Use Node.js 22.13+ (22.x) or 24+, npm, and an activated MATLAB supporting `-batch`
and function argument validation. **Image Processing Toolbox is optional**: the algorithms use base MATLAB
matrix arithmetic, convolution, median, cumulative histograms, and native image I/O. No JavaScript or
Python enhancement fallback is used.

```sh
cd pixel-perfect-view-9751
npm ci --legacy-peer-deps
./run-site.sh
```

Open **http://localhost:8080**. `dev:full` starts the frontend and the local bridge
on `127.0.0.1:3001`. MATLAB starts once and remains running; the connection status
changes to ready after initialization. Ctrl+C stops both services and MATLAB.
The legacy peer flag avoids the npm peer-resolver failure encountered with this
repository's dependency graph. The new DOM dev dependency supplies the peer required
by the existing React Testing Library for the integration checks.

MATLAB is discovered from `PATH`, or installed MATLAB apps in `/Applications` on
macOS. If discovery fails, set an executable path for your installation:

```sh
MATLAB_BIN="/absolute/path/to/matlab" npm run dev:full
```

Alternatively, use two terminals: `npm run backend` and `npm run dev`. Optional
`MATLAB_BRIDGE_PORT` changes the bridge port; set `MATLAB_BRIDGE_URL` to its matching
URL when starting Vite. The Vite development proxy routes `/api/matlab` requests;
`npm run preview` and the Lovable-hosted site do not automatically provide the local
MATLAB service. A deployed build needs an explicitly configured API proxy and a
MATLAB-capable server.

## Processing and interface

- **Intensity Transformations** contains gamma, histogram equalization, and
  contrast stretching. **Spatial Filtering** contains Mean, Gaussian, Median,
  Unsharp Mask, and Sobel. Each category has a short explanation, and the optional
  learning panel explains the selected operation and its neighborhood.
- Upload PNG or JPEG (10 MiB maximum, one frame, up to 16 million pixels). The sample
  image is uploaded through the same MATLAB path. Unsupported/corrupt images receive
  an actionable error. Uploaded data and results live in an OS temporary folder,
  removed at backend shutdown; inactive uploads expire after 30 minutes.
- Gamma applies `s = r^gamma` separately to normalized grayscale or RGB samples.
  Every finite positive gamma is accepted by the API; the slider covers 0.2–3.
  Gamma 1 is an exact identity. The original is never modified.
- Histogram equalization uses a 256-bin CDF with the first occupied cumulative
  count removed. Constant images remain unchanged. RGB equalizes full-range
  BT.601 Y' (`0.299R + 0.587G + 0.114B`) and adds the luminance delta to each channel,
  preserving Cb/Cr before clipping to the representable RGB gamut. This avoids
  independently equalizing the three channels. See the [MathWorks color-space
  reference](https://www.mathworks.com/help/images/ref/rgb2ycbcr.html).
- Contrast stretching maps a selected input brightness range to 0–1:
  `s = clip((r - low) / (high - low), 0, 1)`. The synchronized sliders and numeric
  fields use percentages of brightness, **not percentiles**. Default cutoffs are
  **10–90%**; Gentle uses 2–98%, Balanced 10–90%, and Strong 20–80%. Reset cutoffs
  restores 10–90%. For a low-contrast image with tones around 40–60%, select that
  range to see a stronger expansion. RGB uses the same luminance/chrominance
  approach as equalization, retaining color before unavoidable gamut clipping.
  Constant/near-constant images (luminance span ≤ 1e-6) stay unchanged. The frontend,
  bridge, and MATLAB reject reversed, nonfinite, out-of-bounds, or effectively
  zero-width ranges (minimum normalized span 1e-6).
- Mean uses a normalized box kernel. Gaussian uses a normalized discrete Gaussian
  kernel. Median takes the neighborhood median in bounded batches. Unsharp Mask
  adds a scaled difference between the image and its Gaussian blur. Sobel computes
  gradient magnitude with a fixed normalization and produces a clearly labeled
  **grayscale edge map**, including for RGB input.
- Mean, Gaussian, Median, and Unsharp Mask use replicated boundaries, work on tiny
  images, and accept **every odd kernel size from 3×3 through 15×15**. The visible
  size slider steps by two and rejects invalid values; the bridge and MATLAB also
  reject even, fractional, or out-of-range sizes. Size changes preserve sigma and
  sharpening strength and use the existing debounced MATLAB processing path.
  Gaussian sigma is 0.3–3; sharpening strength is
  0–3, with zero giving an exact identity. RGB smoothing/sharpening uses BT.601
  luminance and adds its change to all channels, retaining chrominance before
  clipping. This preserves color but does not remove purely chromatic noise.
  No Image Processing Toolbox functions are called.
- Kernel size sets the spatial footprint. Larger mean windows blur more detail;
  larger median windows may remove larger noise regions while erasing small
  features. Gaussian weights depend separately on sigma: at fixed sigma, expanding
  the window has little effect once significant weights fit inside it. Unsharp
  uses that Gaussian footprint to extract detail, then scales it by strength.
  Sobel retains its fixed 3×3 derivative operator.
- MATLAB functions preserve `uint8`, `uint16`, `int16`, `single`, `double`, and
  `logical` image classes and their standard ranges. Floating inputs must be finite
  and within 0–1. Indexed PNGs are expanded to RGB. PNG alpha is retained unchanged.
  Exports retain unsigned 8/16-bit precision; signed/floating arrays map to 16-bit
  unsigned PNG, and logical arrays remain binary.
- Histograms contain actual counts in 256 rounded luminance bins, with a shared
  graph scale. Mean and population standard deviation use **all** pixels on a 0–255
  luminance scale, including transparent pixels' color values; alpha is ignored.
  Statistics also include dimensions, channel count, and numeric class in the API.
- Only the chosen method's controls appear. Slider changes are debounced by 350 ms;
  obsolete responses cannot overwrite a newer selection. While updating, the last
  real result remains visible and is labeled as such. Reset restores gamma 1, the
  original returned PNG, default cutoffs, split layout, divider, and zoom. Save
  downloads the current enhanced PNG and is disabled until the selected operation
  succeeds. Unsharp's advanced sigma setting is collapsed by default. Reset
  also returns to the intensity category and restores filter defaults. Edge-map
  labels, histogram legends, and statistics headings identify Sobel output.
  The divider supports dragging and Left/Right keys (Shift for 10% steps),
  plus Home/End. Original previews are labeled honestly if MATLAB is unavailable.
  Start/restart the backend, then use Retry processing if needed.

## Processing Sequence

Expand **Processing Sequence** below the method controls. Configure one operation
using the existing controls and click **Add step** to save its parameter snapshot.
Add up to six steps, move them using the up/down buttons, or remove a step. Later
control changes never modify saved steps; use the pencil on a saved step to edit its parameters, or remove it and add new
settings. **Run sequence** starts with the explicitly selected sequence input (clean original by default) and
applies the saved steps in the displayed order. All eight methods are supported.

For example: Original → Gamma (γ 0.70) → Median (5×5) → Stretch (low 5%, high 95%)
→ Final result. MATLAB keeps each operation's output in memory and passes it to
the next operation, using the same algorithms, native class handling, and border
rules as single-operation processing. The original remains separate. If Sobel
appears anywhere in the sequence, the final output remains labeled as an edge map,
including when a later operation changes its brightness.

The final image appears in the existing comparison stage as **SEQUENCE RESULT**
(or **SEQUENCE EDGE MAP**), with its actual histogram/statistics. Save downloads
that exact final MATLAB PNG. Reset restores the original preview and keeps the
configured sequence. Clear sequence removes its steps and restores the original.
Loading a different image retains the steps but requires an explicit new run.
Changing method controls returns to a single-operation preview; **Preview selected
operation** also switches back without changing saved steps.

MATLAB reports its actual current step and completed-step count; the browser polls
this progress every 350 ms. Very quick steps can finish between polls. The UI uses
step labels rather than an estimated percentage. Controls that could change or
rerun the active sequence are disabled, and the bridge rejects overlapping runs
for the same image. Validation and MATLAB errors identify the failed step. A
failed/changed sequence leaves any previous image labeled as previous and disables
Save until a current run succeeds; a partial result is never returned as complete.

The sequence is held for the current page session. Compact per-step parameters
and actual statistics are returned, without retaining full-size intermediate PNGs.
The educational simulation remains accessible through the selected spatial method
and illustrates that one operation on the original image, separately from running
multiple saved operations. No new dependency was added.

## Noise Playground

Select **Noise Playground** above the category navigation. The same uploaded clean
original is used for every noise realization, separately from normal enhancement
and saved sequences. Choose **Salt-and-pepper** (0–30% probability per pixel,
equally divided into black/white impulses) or **Gaussian** (standard deviation σ
from 0–0.2 on normalized 0–1 intensity; σ 0.05 is approximately 12.8 eight-bit
brightness levels). This is standard deviation, not variance. The default seed is 42. **Add noise** reuses it; **Regenerate** chooses a new seed. Both start from the
clean original, so repeated clicks do not compound noise.

MATLAB generates noise using `add_image_noise.m` through the existing worker queue.
RGB channels share each pixel's assignment or additive Gaussian sample; noise is
not independent per channel. Class/range, dimensions and alpha are preserved;
values clip to the representable range. Small Gaussian perturbations can quantize
away on binary images. The worker's random state is restored after each job.

Choose Mean, Gaussian, Median or Unsharp Mask, adjust the existing kernel/sigma/
strength controls, then **Apply filter**. Every application starts from the same
noisy image, never a previous filtered result. Switch the left comparison between
**Clean original** and **Noisy input**. The right image shows noisy or filtered
output, with its actual MATLAB histogram and statistics. Edited settings label
older results as previous and block stale export. **Save noisy image** and **Save
filtered image** download the respective MATLAB PNG with noise/filter/seed labels.
**Reset playground** clears noisy and filtered results and restores the clean view;
it leaves the saved sequence steps untouched. A sequence bound to the reset noisy
image is blocked until the student explicitly chooses a valid input. Mode switches retain
the experiment; replacing the source image starts a fresh experiment. Histograms
and contrast spread are not restoration-quality scores.

The bridge retains at most 16 noise realizations in its temporary image registry.
Older derived inputs may expire; generate noise again if a filter reports expiry.

## Optional Groq AI Learning Assistant

Open **AI Learning Assistant** in either workspace. Actions explain the selected
result, saved ordered sequence, or an optional next experiment. An optional learning
question is limited to 800 characters. Responses are labeled **AI-generated**, can
be copied, and stay marked as earlier explanations when the experiment changes.
Provider failures have retry controls; they never prevent MATLAB processing.

Configure secrets **only in `bridge/.env`**, which Node reads on backend startup,
or set `GROQ_API_KEY` and `GROQ_MODEL` in the backend process environment. The project
`.env.example` has blank placeholders; no fallback model is assumed. For a fresh
setup, if `bridge/.env` does not already exist:

```sh
cp .env.example bridge/.env
chmod 600 bridge/.env
```

Edit that file locally with your own values:

```dotenv
GROQ_API_KEY=your_private_groq_key
GROQ_MODEL=your_supplied_model_name
```

For this request, the supplied credentials were configured in the ignored local
`bridge/.env`, with model `openai/gpt-oss-120b`. Its key is intentionally absent
from this documentation. Restart `npm run dev:full` after changing configuration.
Do not use `VITE_` variables for credentials. The bridge reads its own file;
frontend tooling never loads it. Real `.env` files are ignored, while the blank
`.env.example` is safe to commit. Credentials remain in the existing server configuration.

The server calls Groq's documented [Chat Completions endpoint](https://console.groq.com/docs/api-reference).
Only allowlisted metadata is sent: selected parameters, saved and completed ordered
steps, applied/draft noise settings, experiment status, dimensions/classes,
measured mean/population standard deviation and histogram summaries (dark bins
0–31, bright bins 224–255). No image, image URL, filename, uploaded bytes or image
ID is sent. The model is instructed to distinguish measurements from general
explanations, failed/pending/stale states from successful results, and suggestions
from guaranteed improvements. It cannot inspect image contents, change settings,
execute MATLAB or alter pixels. Explanations can still be mistaken.

Backend validation limits JSON to 16 KiB, questions to 800 characters, sequences to
six steps, active AI calls to two, requests to 25 seconds, provider responses to
64 KiB, explanation text to 8,000 characters and completion tokens to 2,400.
Missing configuration, rate limits, invalid models/credentials, network failures,
timeouts and malformed responses return safe, actionable errors. Credentials,
questions, provider payloads and raw provider errors are not logged. This optional
cloud feature needs internet access and an available model in your Groq account.
The Noise Playground works independently of Groq.

## Formatted answers and reviewed AI sequences

Assistant answers use `react-markdown` with `remark-gfm` for headings, emphasis,
paragraphs, line breaks, lists, inline/fenced code and useful comparison tables.
These two maintained libraries were added because the project had no Markdown
renderer; using a standard parser avoids maintaining a custom Markdown parser.
The renderer never enables raw HTML, restricts output elements, removes images and
embedded media, and allows only HTTP(S) links with safe external-link attributes.
A rendering error produces readable plain text. Copy explanation copies plain text.
The existing API returns completed responses; no new streaming transport was added.
See [react-markdown's security guidance](https://github.com/remarkjs/react-markdown#security).

The Groq system prompt asks for concise **What happened**, **Why it happened** and
optional **What to try next** sections. Its JSON envelope contains readable Markdown
and an optional structured sequence; students never see the envelope. Ordinary
explanations do not have to recommend a sequence. Malformed/unsupported suggestions
show **Not executable** with a reason, while manual processing stays available.

`shared/operations.json` is the authoritative registry for the eight implemented
operations, categories, defaults, numeric limits, odd-kernel constraints and input
rules. `shared/operations.mjs` validates bridge processing and recommendations, and
also supplies frontend validation/editing. MATLAB's `registered_operations.m`
reads that same file; `apply_operation.m` uses its parameters/defaults/constraints.
At startup, `available_operation_ids.m` probes the installed dispatcher with a tiny
internal fixture and advertises only successful operations in worker readiness and
health. Groq receives that available subset, including descriptions, exact IDs and
parameter rules. Restart the backend after changing the registry or implementations.
Noise is a separate registered action and cannot be inserted into a recommended
sequence. No planned or unsupported operations are advertised as executable.

Groq JSON-object mode is used through its [documented Chat Completions API](https://console.groq.com/docs/reasoning).
The backend requires every recommendation parameter explicitly and validates all
steps before returning an executable preview. It rejects unknown/unavailable IDs,
missing/extra/nonfinite/out-of-range parameters, even kernels, invalid source
bindings, oversized sequences and truncated recommendations. It never clamps,
substitutes parameters or automatically repairs a suggestion into a different one.

The student workflow is:

1. Ask for an explanation or optional experiment.
2. Inspect the compact **AI suggestion** with ordered methods, parameters, optional
   per-step explanations and the source image/noise realization it was based on.
3. Choose **Review sequence**, then **Use this sequence** or **Append steps**.
   Replacing existing steps requires a separate **Confirm replacement** decision.
4. The accepted snapshots become ordinary steps in the existing sequence builder.
   Use the pencil to edit parameters, move steps, remove steps, or choose an input.
5. Click the existing **Run sequence** action to invoke MATLAB. Reviewing, accepting,
   editing, appending and replacing do not process the image or change method controls.

Recommendations become unavailable for acceptance when their image/context changes.
A noisy-input recommendation binds to the reviewed realization's separate image ID;
its type, strength and seed are shown for review. Appending across different saved
input sources is blocked until the student makes an explicit source/replacement
choice. Regenerating/resetting noise or replacing the clean source blocks that saved
binding. The sequence input selector offers the current noise or clean original
explicitly; it never silently switches them. Successful noisy-input sequences can
be compared with **Noisy sequence input** or **Clean original**; their histograms and
statistics follow the selected comparison. Save downloads the actual MATLAB final
PNG with a `noisy-sequence` filename. Error/progress handling remains shared with
manual sequences, and no partial/stale result is exported as current.

## Interactive filter walkthrough

Choose Mean, Gaussian, Median, or Unsharp Mask and click **Simulate steps**. The
focused modal uses a real crop from the selected original image and the current
kernel/sigma/strength. Select a pixel in the image or magnified crop, or move it
using row/column inputs and the image's arrow keys. Previous/Next, numbered steps,
Play/Pause, and Replay keep the learning sequence separate from processing state.

- Mean collects values, shows their sum and division, and replaces one center pixel.
- Median orders the real neighborhood and highlights the middle value.
- Gaussian visualizes normalized weights and weighted contributions before showing
  the local result; sigma remains independent of the window size.
- Unsharp shows original, Gaussian blur, signed detail, scaled detail, and sharpened
  luminance crops with the corresponding center-pixel calculation.

The modal is explicitly an **illustrative local simulation**, using browser-decoded
8-bit BT.601 luminance on a 0–255 scale; numeric labels are rounded. It does not
claim to show MATLAB intermediate data, exact RGB channel values, or a full-image
enhancement. Native precision, decoder differences, transparency, and RGB clipping
can cause differences from exported pixels. Borders replicate the nearest pixel,
including when the entire image is smaller than the kernel. The complete
neighborhood is sampled even outside the visible crop.

The walkthrough can run with MATLAB offline, while actual processing/export remain
unavailable. Opening, moving, or replaying the simulation never changes the saved
MATLAB result. An empty image state links back to loading an image. Sobel's action
is disabled with an explicit explanation because it has no walkthrough yet.
No dependencies were added. Implementation lives in `filter-simulation.ts` (local
calculation/image decoding) and `filter-simulation.tsx` (modal and interaction).

## Integration boundary

`bridge/server.mjs` uses Node built-ins only and launches MATLAB with `spawn`
(no shell). A private temporary directory holds atomic JSON job requests/responses.
`matlab/lumalab_worker.m` handles them sequentially, calling `process_job.m`,
`apply_operation.m`, `enhance_image.m` or `spatial_filter.m`, and `image_analysis.m`. No engine bindings
are required. `bridge/processing.mjs` validates method/category/settings before
queuing a job; MATLAB validates them again at the processing boundary.

The implemented endpoints are:

| Endpoint                          | Request / response                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/matlab/health`          | Actual worker status, MATLAB version, toolbox availability, recovery detail                                                                         |
| `POST /api/matlab/images`         | Raw `image/png` or `image/jpeg` bytes → upload ID and gamma-1 result                                                                                |
| `POST /api/matlab/process`        | JSON `{imageId, category, method, parameters}` → enhanced/original PNG data URLs, histograms and statistics                                         |
| `POST /api/matlab/process`        | JSON `{imageId, steps: [{category, method, parameters}], runId?}` → final sequence PNG, original PNG, actual final analysis and per-step metadata   |
| `POST /api/matlab/process`        | JSON `{imageId, noise: {type, seed, density? or standardDeviation?}}` → clean/noisy PNGs, actual analysis and separate `noisyImageId` for filtering |
| `POST /api/matlab/learning`       | Validated `{action, question?, context}` metadata → AI explanation through server-side Groq                                                         |
| `GET /api/matlab/progress/:runId` | Actual MATLAB sequence state, current step/method, completed count and total; completed progress expires after five minutes                         |

The shared request uses `category: "intensity"` or `"spatial"`. Only the selected
method's parameters are accepted. Defaults are:

| Method           | Category    | Parameters                             |
| ---------------- | ----------- | -------------------------------------- |
| `gamma`          | `intensity` | `{gamma: 1}`                           |
| `equalize`       | `intensity` | `{}`                                   |
| `stretch`        | `intensity` | `{lowCutoff: 0.1, highCutoff: 0.9}`    |
| `mean`, `median` | `spatial`   | `{kernelSize: 3}`                      |
| `gaussian`       | `spatial`   | `{kernelSize: 5, sigma: 1}`            |
| `unsharp`        | `spatial`   | `{kernelSize: 5, sigma: 1, amount: 1}` |
| `sobel`          | `spatial`   | `{}`                                   |

For example, `{imageId, category: "spatial", method: "gaussian", parameters:
{kernelSize: 7, sigma: 1.6}}` requests the corresponding MATLAB blur. Cutoffs use
normalized 0–1 brightness values. Legacy flat intensity requests remain supported,
and an omitted category is inferred from the method. Responses include the actual
`category`, `method`, `parameters`, and `outputKind` (`enhanced` or `edge-map`). All
eight methods use the same MATLAB worker path. No new dependency was added for
spatial filtering or the visual refinement.

Sequence responses use `category: "sequence"`, `method: "sequence"`, and a `steps`
array with each applied category/method/parameter snapshot and `output` statistics.
The optional request `runId` is a UUID used to poll progress; the response always
returns the run ID. Empty sequences, more than six steps, invalid methods/settings,
or mixed single-operation/sequence requests are rejected. Sequence settings are
validated by the bridge and again by MATLAB's shared dispatcher.

The service binds only to loopback, limits upload bytes and queued jobs, validates
file signatures and parameters, and bounds startup (90 seconds) and processing
(60 seconds per requested operation, up to six minutes for a sequence). If MATLAB fails or times out, restart the backend; health never labels
the bridge ready before MATLAB writes its readiness response.

## Focused verification

```sh
npx tsc --noEmit
npm test
npm run test:bridge
# With dev:full already running and MATLAB status ready:
npm run test:api
npm run test:noise-api
# Optional live Groq verification, with credentials configured on the running bridge:
TEST_LIVE_GROQ=1 npm run test:noise-api
# Standalone numeric/image checks; set MATLAB_BIN if MATLAB isn't on PATH:
MATLAB_BIN="/absolute/path/to/matlab" npm run test:matlab
npm run build
```

Readiness on the implementation machine: the frontend initially lacked dependencies
and then started after installation; MATLAB R2026a Update 4 executes successfully;
MathWorks' VS Code MATLAB extension 1.3.14 is installed (a live editor connection was
not checked); Image Processing Toolbox is not installed although its license check
returned true. The base-MATLAB worker runs independently of that missing toolbox.

Numeric tests cover gamma below/equal/above 1, class/range preservation, CDF mapping,
selected stretch cutoffs, clipping, low-contrast grayscale/RGB, constant and
near-constant images, invalid ranges, RGB chrominance, transparency, and 16-bit PNG
identity. They independently recompute histograms and statistics from saved PNGs.
Spatial tests verify impulse responses, replicated corners, Gaussian weights and
sigma, salt-and-pepper removal, unsharp strength/identity, Sobel response, RGB
chrominance, small images, supported classes, and invalid settings. They also
process grayscale and RGB images, preserve 16-bit alpha, and independently analyze
the saved outputs. The API check uses `src/assets/lumalab-sample.jpg` and exercises
all eight methods through the actual frontend proxy → Node → MATLAB path plus
input/category/settings failures. Ten routing/component tests cover presets,
cutoff synchronization, categories, filter settings/validation, edge-map labeling,
reset, save, obsolete responses, comparison, empty state, and an unavailable bridge.
The sequence cases cover frozen parameter snapshots, ordering/removal, progress,
run locking, final result/save labels, reset preserving steps, stale-result export
blocking, clear, and failure/retry without partial success.
Four focused calculation tests independently check sums, Gaussian weights, sorting,
RGB luminance, size-dependent results, strength zero, and replicated small images.
MATLAB numeric checks cover all seven allowed kernel sizes; live API checks exercise
small and large Mean, Gaussian, and Median windows and reject invalid sizes. The
15×15 median took about 6.3 seconds on the 1536×1024 sample on this machine.

The supplied screenshot was not accessible, so the running app was inspected.
Headless Chromium verification used MATLAB-generated low-contrast grayscale and RGB
images: contrast deviation increased from about 14.8 to 73.9/73.7 with 40–60% cutoffs.
Browser checks covered all eight methods, numeric/slider synchronization (including
decimals), cutoff/filter errors, real download bytes matching the MATLAB response,
reset, pointer/keyboard comparison, side-by-side mode, fit-to-view, and empty-image
state. For every spatial filter on grayscale and RGB inputs, the browser separately
recomputed the rendered image's histogram, mean, and deviation and matched MATLAB's
response. Spatial requests on the 1536×1024 sample took approximately 0.6–6.4 seconds
on this machine, including the 15×15 median window.
Desktop/mobile rendering was visually reviewed; widths 320, 390, 768, and 1280 showed
no horizontal overflow. VS Code execution remains outside these checks.

Walkthrough browser checks stepped through all four methods at 3×3 and 15×15 on
known grayscale/RGB images. An independent calculation from their actual pixels
matched each displayed local output; grayscale examples also matched MATLAB's
exported center pixel after rounding. Checks covered sorting, Gaussian weights,
separate sigma/strength, center and border positions, Previous/Next, Play/Pause,
Replay, arrow-key movement, unchanged enhancement/download bytes, Sobel's disabled
walkthrough, responsive modal widths, focus restoration, an empty-state load action,
and a 1×1 image with a 15×15 kernel. A simulated disconnected health state confirmed
that the local illustration works without processing requests or MATLAB-result
claims while Save remains disabled.

Sequence MATLAB tests compare a mixed Gamma → Median → Stretch run with independent
direct algorithm composition, check actual final/per-step analysis and alpha,
exercise all eight operations, confirm order-dependent results, and verify that a
second-step failure records progress/error without writing a partial output. The
live API test independently composes saved MATLAB PNG outputs and matches the
sequence's final image chunks, histogram, and statistics exactly. It also verifies
actual progress, overlapping-run rejection, and indexed invalid-step errors.
Browser sequence checks cover saved snapshots, add/reorder/remove, actual rendered
final histogram/statistics, exact downloaded bytes, original comparison, reset
preserving steps and rerunning, a new input image, clear, single-operation previews,
and the existing simulation. An injected indexed error response verifies failure
display and retry without claiming a partial result is current. Desktop/mobile
captures were reviewed, and widths 320, 390, 768, and 1280 had no horizontal overflow.
The large RGB histogram comparison normalizes samples before calculating luminance,
matching MATLAB's arithmetic order at floating-point half-bin boundaries.

Noise verification covers grayscale/RGB salt-and-pepper and Gaussian generation,
seed reproducibility, RNG isolation, new realizations, no accumulation, supported
classes/ranges, alpha, tiny images, zero strength, invalid settings, saved-image
histograms/statistics and independent mean/median filtering of the noisy pixels.
The live API check independently uploads the noisy PNG and matches the derived-ID
filter output, confirming it consumes noise rather than the clean original.

There are 37 frontend/calculation tests and twelve isolated Node bridge tests. The latter use an explicitly stubbed provider
to test missing configuration, request construction, malformed/oversized responses,
credential-safe errors, provider/network failures and timeouts. Real Groq calls
also succeeded using the supplied local credentials/model through the implemented
backend; these were metadata-only requests, separate from stub tests. Browser
verification covers the real Noise Playground, two filters, current/previous
labels, clean/noisy comparisons, actual histograms, exact downloaded PNG bytes,
reset/regeneration, AI grounding and live response, injected failure/retry, normal
processing independence and responsive layouts. The credential value was checked
against browser-facing responses and generated frontend assets, without printing it.

Formatting/recommendation verification covers headings, emphasis, numbered/bulleted
lists, code, line breaks, tables, unsafe HTML/links/images and an injected renderer
failure. Isolated provider tests confirm that the sent capabilities equal the shared
registry's available subset and reject unsupported IDs, missing settings, invalid
kernels/ranges, unavailable sources and malformed/truncated structured output.
UI tests check explicit acceptance, append, confirmed replacement, sequence limits,
stale recommendations and rejected suggestions leaving manual execution available.
A live Groq call returned a valid two-step recommendation; browser review/accept/edit
and explicit MATLAB execution succeeded. The browser also used clearly isolated
injected recommendations to test append/replacement, unsafe formatting and a noisy
source, then ran that accepted noisy sequence through real MATLAB. Both final PNG
downloads matched the returned bytes. Request counts proved no processing before
Run sequence. Reset noise blocked the old binding, clean comparison remained
available, and layouts at 320/390/768/1280 pixels had no horizontal overflow.

## Compare, history, and regions

Choose an operation and wait for MATLAB, then open **Compare results** and **Add current result**.
Close the workspace, change a method or parameter, and add the next completed result. Two panels
are the default; **Add third result** explicitly enables the third. Each panel retains its exact
input ID, method, parameters, sequence order, ROI, and actual PNG. A different input or rectangle
requires explicit **Start new comparison**. Select a panel to save its full PNG, use it as the active
output, or continue from its pixels. The original input reference stays available. Panels share
fit-to-view proportions and stack on narrow screens.

**History** automatically records successful single operations, complete sequences, generated
noise, and filtered noisy results. It excludes failed/canceled work and cached neutral resets.
Select an entry for its image, exact settings, measurements, and ordered steps. **Use as active
output** pauses the preview on that snapshot; it does not change the original upload, controls,
or saved sequence. Editing controls resumes processing the current input. **Continue from result**
re-registers the selected full PNG with MATLAB as an independent temporary input, resets the
single-operation controls, and preserves saved sequence steps. **Return to original upload**
returns to the original. Noise Playground always retains its clean original separately. Clear
history requires confirmation and leaves active outputs and comparison snapshots untouched.

History and comparisons are **in-memory, session-only**: refresh or leaving the page clears them.
History retains at most **12 entries / 48 MiB** of conservatively counted image strings; old or
oversized entries can be omitted while the active output remains saveable. No image data enters
localStorage, sessionStorage, or Groq. Comparison retains at most three snapshots. Continuing
reuploads the retained PNG, so it also works after the previous MATLAB input expires. The bridge
bounds continued/noisy temporary inputs to 32 plus any currently active jobs, expires idle inputs
after 30 minutes, and cleans files on shutdown. Continued PNG uploads are capped at 64 MiB and
16 million decoded pixels. A failed continuation keeps the selected result available to save.

**Select region** opens drag selection and labeled numeric x/y/width/height controls. Coordinates
are zero-based source pixels; the selector accounts for object-fit letterboxing, image transforms,
CSS zoom, and resizing without relying on device-pixel ratio. Drag inside the rectangle to move
it or its bottom-right corner to resize. **Apply to region** commits at least 8 × 8 pixels within
the image; subsequent operations and explicit sequence runs use that same rectangle. **Fit region**
zooms to the selection; **Clear region** returns to full-image processing. Restored snapshots show
their recorded region in the result details rather than changing the current processing selection.

MATLAB composites the processed region into a copy of the full input; **every sample outside it
and the original alpha remain unchanged**. Intensity operations use region-local statistics.
Spatial filters read the complete current image, including pixels outside the rectangle, and use
the existing replicated boundary only at the actual image edge. Only their ROI output is copied
back, avoiding artificial crop-edge artifacts. Each sequence step reads the preceding full
composite. Local Sobel maps are repeated across RGB channels inside an RGB image to preserve
untouched color outside it; full-image Sobel still returns its existing grayscale edge map.
Compare/history can focus on the actual MATLAB ROI PNG and show local measurements alongside
full-output measurements. Export and continue always use the full composite.

Run locally with `npm run dev:full` and open http://localhost:8080. Relevant checks:

```sh
npm test
npm run test:bridge
npx tsc --noEmit
npm run lint
npm run build
npm run test:matlab  # MATLAB on PATH, or set MATLAB_BIN
npm run test:api    # running local app required
npm run test:noise-api
npm run test:roi-api
```

Actual MATLAB verification covers region RGB/grayscale/uint16 and alpha, exact outside pixels,
full neighborhood context, image boundaries, minimum sizes, local equalization, Sobel composites,
ordered sequences, focused PNGs/statistics, and invalid rectangles. Live browser verification
covers two/three comparison snapshots and selected downloads, independent restoration and
continuation (including after removal or replacement of the upload), ROI drag/move/resize with zoom and letterboxing, history/sequence integration,
refresh clearing, and responsive comparison at laptop/tablet/mobile widths. Existing live
noise/API and explicit AI review-then-run regressions also pass.

The additional live ROI tutor check uses explicitly synthetic metadata; actual MATLAB ROI
pixels/statistics are checked separately. No history or ROI image is transmitted to Groq.
