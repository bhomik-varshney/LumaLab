# Pixel Perfect Pix

LumaLab is a local image enhancement laboratory with a React/TanStack Start frontend
and real MATLAB processing. Its charcoal/green studio dashboard centers the image
comparison, with selective glass panels, contextual adjustments, and actual image
histograms/statistics. Intensity transformations change tones; spatial filters
use neighboring pixels to smooth noise, sharpen detail, or reveal edges.

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
npm run dev:full
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
- Spatial filters use replicated boundaries, work on tiny images, and accept only
  3×3, 5×5, or 7×7 neighborhoods. Gaussian sigma is 0.3–3; sharpening strength is
  0–3, with zero giving an exact identity. RGB smoothing/sharpening uses BT.601
  luminance and adds its change to all channels, retaining chrominance before
  clipping. This preserves color but does not remove purely chromatic noise.
  No Image Processing Toolbox functions are called.
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
  succeeds. Advanced neighborhood/sigma settings are collapsed by default. Reset
  also returns to the intensity category and restores filter defaults. Edge-map
  labels, histogram legends, and statistics headings identify Sobel output.
  The divider supports dragging and Left/Right keys (Shift for 10% steps),
  plus Home/End. Original previews are labeled honestly if MATLAB is unavailable.
  Start/restart the backend, then use Retry processing if needed.

## Integration boundary

`bridge/server.mjs` uses Node built-ins only and launches MATLAB with `spawn`
(no shell). A private temporary directory holds atomic JSON job requests/responses.
`matlab/lumalab_worker.m` handles them sequentially, calling `process_job.m`,
`enhance_image.m` or `spatial_filter.m`, and `image_analysis.m`. No engine bindings
are required. `bridge/processing.mjs` validates method/category/settings before
queuing a job; MATLAB validates them again at the processing boundary.

The implemented endpoints are:

| Endpoint                   | Request / response                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET /api/matlab/health`   | Actual worker status, MATLAB version, toolbox availability, recovery detail                                         |
| `POST /api/matlab/images`  | Raw `image/png` or `image/jpeg` bytes → upload ID and gamma-1 result                                                |
| `POST /api/matlab/process` | JSON `{imageId, category, method, parameters}` → enhanced/original PNG data URLs, histograms and statistics |

The shared request uses `category: "intensity"` or `"spatial"`. Only the selected
method's parameters are accepted. Defaults are:

| Method | Category | Parameters |
| --- | --- | --- |
| `gamma` | `intensity` | `{gamma: 1}` |
| `equalize` | `intensity` | `{}` |
| `stretch` | `intensity` | `{lowCutoff: 0.1, highCutoff: 0.9}` |
| `mean`, `median` | `spatial` | `{kernelSize: 3}` |
| `gaussian` | `spatial` | `{kernelSize: 5, sigma: 1}` |
| `unsharp` | `spatial` | `{kernelSize: 5, sigma: 1, amount: 1}` |
| `sobel` | `spatial` | `{}` |

For example, `{imageId, category: "spatial", method: "gaussian", parameters:
{kernelSize: 7, sigma: 1.6}}` requests the corresponding MATLAB blur. Cutoffs use
normalized 0–1 brightness values. Legacy flat intensity requests remain supported,
and an omitted category is inferred from the method. Responses include the actual
`category`, `method`, `parameters`, and `outputKind` (`enhanced` or `edge-map`). All
eight methods use the same MATLAB worker path. No new dependency was added for
spatial filtering or the visual refinement.

The service binds only to loopback, limits upload bytes and queued jobs, validates
file signatures and parameters, and bounds startup (90 seconds) and processing
(60 seconds). If MATLAB fails or times out, restart the backend; health never labels
the bridge ready before MATLAB writes its readiness response.

## Focused verification

```sh
npx tsc --noEmit
npm test
# With dev:full already running and MATLAB status ready:
npm run test:api
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
input/category/settings failures. Seven routing/component tests cover presets,
cutoff synchronization, categories, filter settings/validation, edge-map labeling,
reset, save, obsolete responses, comparison, empty state, and an unavailable bridge.

The supplied screenshot was not accessible, so the running app was inspected.
Headless Chromium verification used MATLAB-generated low-contrast grayscale and RGB
images: contrast deviation increased from about 14.8 to 73.9/73.7 with 40–60% cutoffs.
Browser checks covered all eight methods, numeric/slider synchronization (including
decimals), cutoff/filter errors, real download bytes matching the MATLAB response,
reset, pointer/keyboard comparison, side-by-side mode, fit-to-view, and empty-image
state. For every spatial filter on grayscale and RGB inputs, the browser separately
recomputed the rendered image's histogram, mean, and deviation and matched MATLAB's
response. Spatial requests on the 1536×1024 sample took approximately 0.6–2 seconds
on this machine, including the 7×7 median window.
Desktop/mobile rendering was visually reviewed; widths 320, 390, 768, and 1280 showed
no horizontal overflow. VS Code execution remains outside these checks.
