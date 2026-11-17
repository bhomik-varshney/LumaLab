# LumaLab — Assignment Submission

## Project details

| Field                   | Details                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Project title           | LumaLab — MATLAB-Powered Image Enhancement Studio                                                                        |
| GitHub repository       | [https://github.com/bhomik-varshney/pixel-perfect-view-9751](https://github.com/bhomik-varshney/pixel-perfect-view-9751) |
| Student name            | `[Your name]`                                                                                                            |
| Designation / programme | `[Your designation, programme, and semester]`                                                                            |
| Faculty number          | `[Faculty number]`                                                                                                       |
| Enrolment number        | `[Enrolment number]`                                                                                                     |
| Contact number          | `[Contact number]`                                                                                                       |
| Course / subject        | `[Course name and code]`                                                                                                 |
| Submission date         | `[DD Month YYYY]`                                                                                                        |

## Project summary

LumaLab is a web-based image enhancement studio that connects an interactive React
interface to a MATLAB processing service. It lets a student upload an image, inspect
measured histograms and statistics, apply image-processing operations, compare the
original and enhanced results, and download the resulting image.

## What this assignment demonstrates

- **Intensity transformations:** gamma correction, histogram equalization, and
  contrast stretching.
- **Spatial filtering:** mean, Gaussian, median, unsharp-mask, and Sobel edge
  operations, including kernel-size and parameter controls.
- **Image analysis:** actual luminance histograms, mean brightness, standard
  deviation, dimensions, and channel/class information calculated from the
  processed image.
- **Noise experimentation:** repeatable salt-and-pepper and Gaussian noise,
  followed by filtering from the same noisy input for fair comparison.
- **Processing workflow design:** ordered processing sequences, progress feedback,
  result history, A/B/C comparison, continuation from saved results, and PNG export.
- **Region of interest (ROI) processing:** applying supported operations to a
  selected part of an image while preserving pixels outside the region.
- **Accessible interaction:** responsive panels, keyboard-accessible image controls,
  and a movable LUMA AI learning launcher that stores its safe viewport position.
- **Client/server integration:** a React/TanStack Start frontend, Node bridge, and
  MATLAB worker that validate inputs and return real image outputs rather than a
  browser-only processing substitute.

## How to run the submitted project

Prerequisites: Node.js 24, npm, and an activated MATLAB installation available on
the machine. The implemented algorithms use base MATLAB operations; Image Processing
Toolbox is optional.

```sh
npm ci --include=dev
npm run dev:full
```

Open `http://localhost:8080`, upload a PNG or JPEG, choose a method, and wait for
the MATLAB status to report ready before running a real enhancement. The local
development command starts both the frontend and MATLAB bridge. If MATLAB is not on
the system path, provide the executable path when starting the project:

```sh
MATLAB_BIN="/absolute/path/to/matlab" npm run dev:full
```

## Submission checklist

- [ ] Replace every bracketed field in the project-details table.
- [ ] Confirm the GitHub repository link opens and points to the final submitted
      branch or commit.
- [ ] Run `npm ci --include=dev` and `npm run dev:full` on the intended machine.
- [ ] Upload a sample image and demonstrate at least one intensity transformation
      and one spatial filter with MATLAB status ready.
- [ ] Verify that an enhanced image can be compared and exported as PNG.
- [ ] Include any course-required screenshots, report, or video link with the
      submission if applicable.
- [ ] Do not commit `.env`, `bridge/.env`, API keys, MATLAB license files, or other
      private credentials.

## Important implementation note

The interactive interface can load without MATLAB, but real enhancement, measured
output statistics, sequences, ROI processing, noise filtering, and processed-image
export require the MATLAB bridge to be available. The optional LUMA AI assistant is
separate from image processing and requires its own server-side configuration.

## Email draft to faculty

**Subject:** Assignment Submission — LumaLab: MATLAB-Powered Image Enhancement Studio

Dear **[Faculty Member's Name]**,

Please find my assignment submission for **[Course Name / Code]** attached/shared
below. The project is titled **LumaLab — MATLAB-Powered Image Enhancement Studio**.

LumaLab demonstrates practical digital image-processing concepts through an
interactive web interface connected to MATLAB. It includes intensity transformations
(gamma correction, histogram equalization, and contrast stretching), spatial
filtering (mean, Gaussian, median, unsharp masking, and Sobel edge detection),
histogram and statistical analysis, noise generation and removal, region-of-interest
processing, ordered processing sequences, result comparison/history, and PNG export.
The application is designed to show both the image-processing workflow and the
integration of a modern frontend with MATLAB-based computation.

GitHub repository: https://github.com/bhomik-varshney/pixel-perfect-view-9751

Kindly let me know if any additional material or demonstration is required.

Regards,  
**[Your Name]**  
**Designation / Programme / Semester:** [Your designation, programme, and semester]  
**Faculty Number:** [Faculty number]  
**Enrolment Number:** [Enrolment number]  
**Contact Number:** [Contact number]
