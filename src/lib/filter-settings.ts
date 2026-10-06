export const MIN_KERNEL_SIZE = 3;
export const MAX_KERNEL_SIZE = 15;
export const isValidKernelSize = (size: number) =>
  Number.isInteger(size) && size >= MIN_KERNEL_SIZE && size <= MAX_KERNEL_SIZE && size % 2 === 1;

export const footprintGuidance = {
  mean: "A larger neighborhood averages more pixels and blurs more fine detail.",
  gaussian:
    "A larger neighborhood includes more distant pixels. At fixed sigma, its effect levels off once the important Gaussian weights fit inside it.",
  median: "A larger neighborhood can remove larger noise regions, but may erase small features.",
  unsharp:
    "Kernel size sets the Gaussian blur’s footprint used to extract detail. Sigma sets its spread; strength controls how much detail is added back.",
};
