export function Histogram({
  original,
  enhanced,
  label = "Original and enhanced luminance histogram",
}: {
  original: number[];
  enhanced: number[];
  label?: string;
}) {
  const peak = Math.max(...original, ...enhanced, 1);
  const path = (bins: number[]) =>
    bins
      .map(
        (value, index) =>
          `${index === 0 ? "M" : "L"}${(index / 255) * 480},${98 - (value / peak) * 86}`,
      )
      .join(" ");
  const enhancedPath = path(enhanced);
  return (
    <div className="histogram-chart">
      <div className="histogram-scale">
        <span>Pixel count</span>
        <span>
          {original.length
            ? `Peak ${Math.max(...original, ...enhanced).toLocaleString("en-US")}`
            : "—"}
        </span>
      </div>
      <svg viewBox="0 0 480 108" role="img" aria-label={label} preserveAspectRatio="none">
        {[12, 40, 68, 98].map((y) => (
          <line key={y} x1={0} x2={480} y1={y} y2={y} className="histogram-grid" />
        ))}
        {enhanced.length > 0 && (
          <path d={`${enhancedPath} L480,98 L0,98 Z`} className="histogram-fill" />
        )}
        <path d={path(original)} className="histogram-original" />
        <path d={enhancedPath} className="histogram-enhanced" />
      </svg>
      <div className="histogram-ticks">
        <span>0</span>
        <span>64</span>
        <span>128</span>
        <span>192</span>
        <span>255</span>
      </div>
    </div>
  );
}
