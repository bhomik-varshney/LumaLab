# Pixel Perfect Pix

LumaLab is a local image enhancement laboratory with a React/TanStack Start frontend
and real MATLAB processing. Its original layout, upload control, presets, comparison
views, histogram and statistics panels are retained.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pixel-perfect-view-9751.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/907b37a4-a22b-4a4c-a40d-2234f9db09d0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Use Node.js 22.13+ (22.x) or 24+, npm, and an activated MATLAB supporting `-batch`
(R2019a+). **Image Processing Toolbox is optional**: the algorithms use base MATLAB
matrix arithmetic, cumulative histograms, and native image I/O. No JavaScript or
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
- Contrast stretching maps observed minimum/maximum grayscale or luminance values
  to 0–1, using the same chrominance handling for RGB.
- MATLAB functions preserve `uint8`, `uint16`, `int16`, `single`, `double`, and
  `logical` image classes and their standard ranges. Floating inputs must be finite
  and within 0–1. Indexed PNGs are expanded to RGB. PNG alpha is retained unchanged.
  Exports retain unsigned 8/16-bit precision; signed/floating arrays map to 16-bit
  unsigned PNG, and logical arrays remain binary.
- Histograms contain actual counts in 256 rounded luminance bins, with a shared
  graph scale. Mean and population standard deviation use **all** pixels on a 0–255
  luminance scale, including transparent pixels' color values; alpha is ignored.
  Statistics also include dimensions, channel count, and numeric class in the API.
- Slider changes are debounced by 350 ms. Obsolete responses cannot overwrite a
  newer selection. Reset restores gamma 1, the original returned PNG, comparison
  divider, and zoom. Save downloads the returned enhanced PNG and is disabled until
  the current operation succeeds. Original previews are labeled honestly if MATLAB
  is unavailable. Start/restart the backend, then use Retry processing if needed.

## Integration boundary

`bridge/server.mjs` uses Node built-ins only and launches MATLAB with `spawn`
(no shell). A private temporary directory holds atomic JSON job requests/responses.
`matlab/lumalab_worker.m` handles them sequentially, calling `process_job.m`,
`enhance_image.m`, and `image_analysis.m`. No engine bindings are required.

The implemented endpoints are:

| Endpoint                   | Request / response                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /api/matlab/health`   | Actual worker status, MATLAB version, toolbox availability, recovery detail                  |
| `POST /api/matlab/images`  | Raw `image/png` or `image/jpeg` bytes → upload ID and gamma-1 result                         |
| `POST /api/matlab/process` | JSON `{imageId, method, gamma}` → enhanced/original PNG data URLs, histograms and statistics |

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
constant images, RGB chrominance, full pixel counts and statistics, transparency,
and 16-bit PNG identity. The API check uses `src/assets/lumalab-sample.jpg` and exercises
the actual frontend proxy → Node → MATLAB path plus input failures. Component tests
cover presets/equalization, reset, save URL selection, obsolete responses, and an
unavailable bridge. The attachment available here contained only the request text,
so the repository sample was used. A visual browser review and VS Code execution
are not covered by these checks.
